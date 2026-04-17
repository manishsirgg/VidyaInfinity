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
      .from("course_orders")
      .select("id,user_id,course_id,institute_id,payment_status,final_paid_amount,institute_receivable_amount,currency")
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
      await admin.data.from("course_orders").update({ payment_status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const { error: updateOrderError } = await admin.data
      .from("course_orders")
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
        order_type: "course",
        order_id: order.id,
        user_id: user.id,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        amount: order.final_paid_amount,
        currency: order.currency,
        status: "captured",
        payload: { source: "course_verify_api" },
      },
      { onConflict: "razorpay_payment_id" }
    );

    const { error: enrollmentError } = await admin.data.from("course_enrollments").upsert(
      {
        user_id: user.id,
        course_id: order.course_id,
        institute_id: order.institute_id,
        enrollment_status: "enrolled",
        order_id: order.id,
      },
      { onConflict: "user_id,course_id" }
    );

    if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });

    await admin.data.from("institute_payouts").insert({
      institute_id: order.institute_id,
      course_order_id: order.id,
      amount_payable: order.institute_receivable_amount,
      payout_status: "pending",
      due_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify course payment" },
      { status: 500 }
    );
  }
}
