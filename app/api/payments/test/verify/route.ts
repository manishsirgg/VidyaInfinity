import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { finalizePaidPsychometricOrder } from "@/lib/payments/psychometric-finalize";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "psychometric"]);
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { profile } = auth;
    const body = await request.json();
    const localOrderId = typeof body?.local_order_id === "string" ? body.local_order_id : undefined;
    const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : body?.orderId;
    const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : body?.paymentId;
    const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : body?.signature;

    if (!orderId || !paymentId) {
      return NextResponse.json({ error: "razorpay_order_id and razorpay_payment_id are required" }, { status: 400 });
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

    let orderQuery = admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,payment_status,final_amount,currency,attempt_id,coupon_id")
      .eq("razorpay_order_id", orderId)
      .eq("user_id", profile.id);
    if (localOrderId) orderQuery = orderQuery.eq("id", localOrderId);
    const { data: orderByRazorpayOrder, error: orderFetchError } = await orderQuery.limit(1).maybeSingle();
    let order = orderByRazorpayOrder;

    if ((!order || orderFetchError) && paymentId) {
      const { data: orderByPaymentId } = await admin.data
        .from("psychometric_orders")
        .select("id,user_id,test_id,payment_status,final_amount,currency,attempt_id,coupon_id,razorpay_order_id")
        .eq("user_id", profile.id)
        .eq("razorpay_payment_id", paymentId)
        .limit(1)
        .maybeSingle();
      if (orderByPaymentId) order = orderByPaymentId;
    }

    if (!order) {
      console.warn("[payments/test/verify] local_order_missing", {
        event: "local_order_missing",
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        userId: profile.id,
      });
      return NextResponse.json({ error: "Order not found for this user" }, { status: 404 });
    }

    if (signature) {
      const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
      if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });
      if (!signatureResult.valid) {
        await admin.data.from("psychometric_orders").update({ payment_status: "failed" }).eq("id", order.id);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
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

    const expectedAmountInPaise = Math.round(Number(order.final_amount) * 100);
    if (
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      payment.status !== "captured" ||
      Number(payment.amount ?? 0) !== expectedAmountInPaise ||
      (payment.currency ?? "").toUpperCase() !== order.currency.toUpperCase()
    ) {
      await admin.data.from("psychometric_orders").update({ payment_status: "failed" }).eq("id", order.id).in("payment_status", ["created", "failed"]);
      return NextResponse.json({ error: "Payment validation failed" }, { status: 400 });
    }

    const reconciled = await reconcilePsychometricOrderPaid({
      supabase: admin.data,
      order,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      source: "verify_api",
    });

    if (reconciled.error) {
      return NextResponse.json({ error: reconciled.error }, { status: 500 });
    }

    const finalized = await finalizePaidPsychometricOrder({ supabase: admin.data, psychometricOrderId: order.id, source: "verify_api" });
    if (finalized.error) return NextResponse.json({ error: finalized.error }, { status: 500 });

    const attemptId = finalized.attemptId ?? null;
    const redirectTo = attemptId ? `/dashboard/psychometric/attempts/${attemptId}` : "/dashboard/psychometric";

    return NextResponse.json({ ok: true, idempotent: order.payment_status === "paid", attemptId, redirectTo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify psychometric payment" },
      { status: 500 }
    );
  }
}
