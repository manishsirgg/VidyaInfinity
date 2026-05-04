import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { resolveFeaturedPlan } from "@/lib/featured-plan-resolution";
import { notifyInstituteAndAdmins } from "@/lib/featured-notifications";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder } from "@/lib/featured-reconciliation";

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


export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { orderId, paymentId, signature } = (await request.json()) as VerifyBody;
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });
  try {
    await admin.data.rpc("expire_course_featured_subscriptions");
  } catch {
    // ignore cleanup failures on verify path
  }

  let { data: existingOrder } = await admin.data
    .from("course_featured_orders")
    .select("id,institute_id,created_by,course_id,plan_id,amount,currency,duration_days,payment_status,order_status,metadata")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", instituteId)
    .maybeSingle<ExistingOrder & { metadata?: Record<string, unknown> | null }>();

  if (!existingOrder) {
    const fallback = await admin.data
      .from("course_featured_orders")
      .select("id,institute_id,created_by,course_id,plan_id,amount,currency,duration_days,payment_status,order_status,metadata")
      .eq("id", orderId)
      .eq("institute_id", instituteId)
      .maybeSingle<ExistingOrder & { metadata?: Record<string, unknown> | null }>();
    existingOrder = fallback.data ?? null;
  }

  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Featured subscriptions are Razorpay-only. Wallet-first featured activation is intentionally unsupported.
  const paymentMethod = String(existingOrder.metadata?.payment_method ?? "").toLowerCase();
  if (paymentMethod === "wallet") {
    return NextResponse.json(
      {
        success: false,
        message: "Featured subscriptions are Razorpay-only. Wallet payments are not supported for this purchase.",
        code: "FEATURED_WALLET_PAYMENT_UNSUPPORTED",
      },
      { status: 400 },
    );
  }

  if (isSuccessfulPaymentStatus(existingOrder.payment_status)) {
    const { data: existingSubscription } = await admin.data
      .from("course_featured_subscriptions")
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

    return NextResponse.json({ error: "Payment received but activation is pending. Admin reconciliation required.", activation_status: "needs_reconciliation", payment_received: true, orderId: existingOrder.id }, { status: 202 });
  }

  if (!["pending", "failed", "paid"].includes(existingOrder.payment_status) || existingOrder.order_status === "cancelled") {
    return NextResponse.json({ error: "Order is not eligible for verification" }, { status: 409 });
  }

  if (!paymentId || !signature) {
    return NextResponse.json({ error: "paymentId and signature are required for Razorpay payments" }, { status: 400 });
  }

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId: paymentId!, signature: signature! });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });
  if (!signatureResult.valid) {
    await admin.data
      .from("course_featured_orders")
      .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", existingOrder.id)
      .in("payment_status", ["pending", "failed"]);
    await notifyInstituteAndAdmins({
      admin: admin.data,
      instituteUserId: auth.user.id,
      title: "Course featuring payment failed",
      message: "Course featured payment signature verification failed.",
      metadata: { orderId: existingOrder.id, razorpayOrderId: orderId, reason: "invalid_signature" },
    });
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
      payment = (await razorpay.data.payments.fetch(paymentId!)) as RazorpayPayment;
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
        .from("course_featured_orders")
        .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", existingOrder.id)
        .in("payment_status", ["pending", "failed"]);
      await notifyInstituteAndAdmins({
        admin: admin.data,
        instituteUserId: auth.user.id,
        title: "Course featuring payment failed",
        message: "Course featured payment did not pass Razorpay capture validation.",
        metadata: { orderId: existingOrder.id, razorpayOrderId: orderId, reason: "payment_validation_failed" },
      });
      return NextResponse.json({ error: "Payment validation failed" }, { status: 400 });
    }
  const nowIso = new Date().toISOString();
  const { error: paidUpdateError } = await admin.data
    .from("course_featured_orders")
    .update({
      payment_status: "paid",
      order_status: "confirmed",
      paid_at: nowIso,
      razorpay_payment_id: paymentId!,
      razorpay_signature: signature!,
      updated_at: nowIso,
    })
    .eq("id", existingOrder.id)
    .in("payment_status", ["pending", "failed"])
    .neq("order_status", "cancelled");

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

  const planResolution = await resolveFeaturedPlan({
    admin: admin.data,
    table: "course_featured_plans",
    selectedPlanToken: existingOrder.plan_id,
  });
  const plan = planResolution.plan;

  const planCode = plan?.plan_code ?? plan?.code;
  if (!planCode) return NextResponse.json({ error: "Unable to resolve plan code" }, { status: 500 });
  const activation = await activateFeaturedSubscriptionFromPaidOrder({
    supabase: admin.data,
    orderType: "course",
    orderId: existingOrder.id,
    razorpayOrderId: existingOrder.id === orderId ? undefined : orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    source: "verify",
    actorUserId: auth.user.id,
  });
  if (!activation.ok) {
    return NextResponse.json({ payment_received: true, activation_status: "needs_reconciliation", message: "Payment received. Activation is being reconciled.", orderId: existingOrder.id }, { status: 202 });
  }
  return NextResponse.json({ ok: true, orderId: existingOrder.id, activation_status: activation.activationStatus ?? (activation.idempotent ? "active" : "active"), subscriptionId: activation.subscriptionId });

}
