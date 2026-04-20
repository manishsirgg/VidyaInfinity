import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, getNextCourseFeaturedWindow } from "@/lib/course-featured";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type VerifyBody = {
  orderId?: string;
  paymentId?: string;
  signature?: string;
};

type ExistingOrder = {
  id: string;
  institute_id: string;
  created_by: string;
  course_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  duration_days: number;
  payment_status: string;
  order_status: string;
};

type PlanRow = {
  id: string;
  plan_code: string | null;
  code: string | null;
};

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { orderId, paymentId, signature } = (await request.json()) as VerifyBody;
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "orderId, paymentId, and signature are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const { data: existingOrder } = await admin.data
    .from("course_featured_orders")
    .select("id,institute_id,created_by,course_id,plan_id,amount,currency,duration_days,payment_status,order_status")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", instituteId)
    .maybeSingle<ExistingOrder>();

  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (existingOrder.payment_status === "paid") return NextResponse.json({ ok: true, idempotent: true });

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });
  if (!signatureResult.valid) {
    await admin.data
      .from("course_featured_orders")
      .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", existingOrder.id);
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { error: paidUpdateError } = await admin.data
    .from("course_featured_orders")
    .update({
      payment_status: "paid",
      order_status: "confirmed",
      paid_at: nowIso,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      updated_at: nowIso,
    })
    .eq("id", existingOrder.id)
    .in("payment_status", ["pending", "failed"]);

  if (paidUpdateError) return NextResponse.json({ error: paidUpdateError.message }, { status: 500 });

  const { data: course } = await admin.data
    .from("courses")
    .select("id,institute_id,status,is_active,title")
    .eq("id", existingOrder.course_id)
    .eq("institute_id", instituteId)
    .maybeSingle<{ id: string; institute_id: string; status: string; is_active: boolean | null; title: string | null }>();

  if (!course || course.status !== "approved" || course.is_active === false) {
    await admin.data.from("course_featured_orders").update({ order_status: "cancelled", updated_at: nowIso }).eq("id", existingOrder.id);
    return NextResponse.json({ error: "Course is no longer eligible for featuring" }, { status: 400 });
  }

  const { data: plan } = await admin.data
    .from("course_featured_plans")
    .select("id,plan_code,code")
    .eq("id", existingOrder.plan_id)
    .maybeSingle<PlanRow>();

  const planCode = plan?.plan_code ?? plan?.code;
  if (!planCode) return NextResponse.json({ error: "Unable to resolve plan code" }, { status: 500 });

  const window = await getNextCourseFeaturedWindow(admin.data, existingOrder.course_id, Number(existingOrder.duration_days));
  const status = window.queuedFromPrevious ? "scheduled" : "active";

  const { error: subscriptionInsertError } = await admin.data.from("course_featured_subscriptions").insert({
    institute_id: instituteId,
    course_id: existingOrder.course_id,
    order_id: existingOrder.id,
    plan_id: existingOrder.plan_id,
    created_by: auth.user.id,
    plan_code: planCode,
    amount: existingOrder.amount,
    currency: existingOrder.currency,
    duration_days: existingOrder.duration_days,
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    queued_from_previous: window.queuedFromPrevious,
    status,
    activated_at: status === "active" ? nowIso : null,
    updated_at: nowIso,
  });

  if (subscriptionInsertError) return NextResponse.json({ error: subscriptionInsertError.message }, { status: 500 });

  await createAccountNotification({
    userId: auth.user.id,
    type: "approval",
    title: status === "active" ? "Course featuring activated" : "Course featuring scheduled",
    message:
      status === "active"
        ? `${course.title ?? "Course"} is now live in featured listings.`
        : `${course.title ?? "Course"} featured extension is confirmed and scheduled.`,
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    idempotent: false,
    status,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    queuedFromPrevious: window.queuedFromPrevious,
  });
}
