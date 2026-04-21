import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "psychometric"]);
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { orderId, paymentId, signature } = await request.json();

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

    const { data: order, error: orderFetchError } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,payment_status,final_paid_amount,currency")
      .eq("razorpay_order_id", orderId)
      .eq("user_id", user.id)
      .single();

    if (orderFetchError || !order) {
      return NextResponse.json({ error: "Order not found for this user" }, { status: 404 });
    }

    const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

    if (!signatureResult.valid) {
      await admin.data.from("psychometric_orders").update({ payment_status: "failed" }).eq("id", order.id);
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

    const expectedAmountInPaise = Math.round(Number(order.final_paid_amount) * 100);
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

    return NextResponse.json({ ok: true, idempotent: order.payment_status === "paid" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify psychometric payment" },
      { status: 500 }
    );
  }
}
