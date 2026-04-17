import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse();
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

    const { data: order, error: orderFetchError } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,payment_status,final_paid_amount,currency")
      .eq("razorpay_order_id", orderId)
      .eq("user_id", user.id)
      .single();

    if (orderFetchError || !order) {
      return NextResponse.json({ error: "Order not found for this user" }, { status: 404 });
    }

    if (order.payment_status === "paid") {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

    if (!signatureResult.valid) {
      await admin.data.from("psychometric_orders").update({ payment_status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const { error: updateOrderError } = await admin.data
      .from("psychometric_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("payment_status", "created");

    if (updateOrderError) return NextResponse.json({ error: updateOrderError.message }, { status: 500 });

    await admin.data.from("razorpay_transactions").upsert(
      {
        order_type: "psychometric",
        order_id: order.id,
        user_id: user.id,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        amount: order.final_paid_amount,
        currency: order.currency,
        status: "captured",
        payload: { source: "psychometric_verify_api" },
      },
      { onConflict: "razorpay_payment_id" }
    );

    await admin.data.from("test_attempts").upsert(
      {
        user_id: user.id,
        test_id: order.test_id,
        status: "unlocked",
        started_at: null,
      },
      { onConflict: "user_id,test_id" }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify psychometric payment" },
      { status: 500 }
    );
  }
}
