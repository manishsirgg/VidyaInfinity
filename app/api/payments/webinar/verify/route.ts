import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function reconcileWebinarWithRetry(payload: Parameters<typeof reconcileWebinarOrderPaid>[0], attempts = 2) {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reconciled = await reconcileWebinarOrderPaid(payload);
    if (!reconciled.error) return { error: null };
    lastError = reconciled.error;
    console.warn("[payments/webinar/verify] webinar_reconcile_retry", {
      event: "webinar_reconcile_retry",
      order_id: payload.order.id,
      razorpay_order_id: payload.razorpayOrderId,
      razorpay_payment_id: payload.razorpayPaymentId,
      attempt,
      attempts,
      error: reconciled.error,
    });
  }
  return { error: lastError ?? "Unable to reconcile webinar payment" };
}

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "webinar"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { orderId, paymentId, signature } = (await request.json()) as {
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "orderId, paymentId, signature are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: duplicateTransaction } = await admin.data
    .from("razorpay_transactions")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (duplicateTransaction) {
    return NextResponse.json({ ok: true, idempotent: true, duplicate: true });
  }

  const { data: order } = await admin.data
    .from("webinar_orders")
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status")
    .eq("razorpay_order_id", orderId)
    .eq("student_id", auth.user.id)
    .maybeSingle<{
      id: string;
      webinar_id: string;
      student_id: string;
      institute_id: string;
      amount: number;
      currency: string;
      payment_status: string;
      order_status: string;
      access_status: string;
    }>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.order_status === "cancelled") return NextResponse.json({ error: "Order is cancelled" }, { status: 409 });

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

  if (!signatureResult.valid) {
    await admin.data.from("webinar_orders").update({ payment_status: "failed", order_status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to validate payment" }, { status: 502 });
  }

  const expectedAmountInPaise = Math.round(Number(order.amount) * 100);
  if (
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.status !== "captured" ||
    Number(payment.amount ?? 0) !== expectedAmountInPaise ||
    (payment.currency ?? "").toUpperCase() !== order.currency.toUpperCase()
  ) {
    await admin.data.from("webinar_orders").update({ payment_status: "failed", order_status: "failed" }).eq("id", order.id).in("payment_status", ["pending", "failed"]);
    return NextResponse.json({ error: "Payment validation failed" }, { status: 400 });
  }

  const reconciled = await reconcileWebinarWithRetry({
    supabase: admin.data,
    order,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    source: "verify_api",
    paymentEventType: "payment.verify",
  });

  if (reconciled.error) {
    return NextResponse.json({ error: reconciled.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, idempotent: order.payment_status === "paid" });
}
