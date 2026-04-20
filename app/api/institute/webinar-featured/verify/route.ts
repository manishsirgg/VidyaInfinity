import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { expireWebinarFeaturedSubscriptionsSafe, getNextWebinarFeaturedWindow, isWebinarPromotable } from "@/lib/webinar-featured";

type VerifyBody = {
  orderId?: string;
  paymentId?: string;
  signature?: string;
};

type ExistingOrder = {
  id: string;
  institute_id: string;
  created_by: string;
  webinar_id: string;
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
  await expireWebinarFeaturedSubscriptionsSafe(admin.data);

  const { data: existingOrder } = await admin.data
    .from("webinar_featured_orders")
    .select("id,institute_id,created_by,webinar_id,plan_id,amount,currency,duration_days,payment_status,order_status")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", instituteId)
    .maybeSingle<ExistingOrder>();

  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (existingOrder.payment_status === "paid") {
    const { data: existingSubscription } = await admin.data
      .from("webinar_featured_subscriptions")
      .select("id,status,starts_at,ends_at,queued_from_previous")
      .eq("order_id", existingOrder.id)
      .maybeSingle<{ id: string; status: string; starts_at: string; ends_at: string; queued_from_previous: boolean | null }>();

    if (existingSubscription) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        status: existingSubscription.status,
        startsAt: existingSubscription.starts_at,
        endsAt: existingSubscription.ends_at,
        queuedFromPrevious: existingSubscription.queued_from_previous,
      });
    }

    return NextResponse.json({ error: "Paid order is missing featured subscription. Contact support." }, { status: 409 });
  }

  if (!["pending", "failed"].includes(existingOrder.payment_status) || existingOrder.order_status === "cancelled") {
    return NextResponse.json({ error: "Order is not eligible for verification" }, { status: 409 });
  }

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });
  if (!signatureResult.valid) {
    await admin.data
      .from("webinar_featured_orders")
      .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", existingOrder.id)
      .in("payment_status", ["pending", "failed"]);
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  type RazorpayPayment = {
    id?: string;
    order_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };

  let payment: RazorpayPayment;
  try {
    payment = (await razorpay.data.payments.fetch(paymentId)) as RazorpayPayment;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to validate payment details" },
      { status: 502 },
    );
  }

  const expectedAmountInPaise = Math.round(Number(existingOrder.amount) * 100);
  if (
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.status !== "captured" ||
    Number(payment.amount ?? 0) !== expectedAmountInPaise ||
    (payment.currency ?? "").toUpperCase() !== existingOrder.currency.toUpperCase()
  ) {
    await admin.data
      .from("webinar_featured_orders")
      .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", existingOrder.id)
      .in("payment_status", ["pending", "failed"]);
    return NextResponse.json({ error: "Payment validation failed" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { error: paidUpdateError } = await admin.data
    .from("webinar_featured_orders")
    .update({
      payment_status: "paid",
      order_status: "confirmed",
      paid_at: nowIso,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      updated_at: nowIso,
    })
    .eq("id", existingOrder.id)
    .in("payment_status", ["pending", "failed"])
    .neq("order_status", "cancelled");

  if (paidUpdateError) return NextResponse.json({ error: paidUpdateError.message }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,institute_id,title,approval_status,status,ends_at")
    .eq("id", existingOrder.webinar_id)
    .eq("institute_id", instituteId)
    .maybeSingle<{ id: string; institute_id: string; title: string | null; approval_status: string; status: string; ends_at: string | null }>();

  if (!webinar || !isWebinarPromotable(webinar)) {
    await admin.data.from("webinar_featured_orders").update({ order_status: "cancelled", updated_at: nowIso }).eq("id", existingOrder.id);
    return NextResponse.json({ error: "Webinar is no longer eligible for featuring" }, { status: 400 });
  }

  const { data: plan } = await admin.data
    .from("webinar_featured_plans")
    .select("id,plan_code,code")
    .eq("id", existingOrder.plan_id)
    .maybeSingle<PlanRow>();

  const planCode = plan?.plan_code ?? plan?.code;
  if (!planCode) return NextResponse.json({ error: "Unable to resolve plan code" }, { status: 500 });

  const existingSubscription = await admin.data
    .from("webinar_featured_subscriptions")
    .select("status,starts_at,ends_at,queued_from_previous")
    .eq("order_id", existingOrder.id)
    .maybeSingle<{ status: string; starts_at: string; ends_at: string; queued_from_previous: boolean | null }>();

  if (existingSubscription.data) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      status: existingSubscription.data.status,
      startsAt: existingSubscription.data.starts_at,
      endsAt: existingSubscription.data.ends_at,
      queuedFromPrevious: existingSubscription.data.queued_from_previous,
    });
  }

  const window = await getNextWebinarFeaturedWindow(admin.data, existingOrder.webinar_id, Number(existingOrder.duration_days));
  const status = window.queuedFromPrevious ? "scheduled" : "active";

  const { error: subscriptionInsertError } = await admin.data.from("webinar_featured_subscriptions").insert({
    institute_id: instituteId,
    webinar_id: existingOrder.webinar_id,
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
    title: status === "active" ? "Webinar promotion activated" : "Webinar promotion scheduled",
    message:
      status === "active"
        ? `${webinar.title ?? "Webinar"} is now live in featured webinar listings.`
        : `${webinar.title ?? "Webinar"} featured webinar extension is confirmed and scheduled.`,
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
