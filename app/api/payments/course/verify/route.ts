import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse();
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student", { requireApproved: false });
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
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,payment_status,gross_amount,institute_receivable_amount,currency")
      .eq("razorpay_order_id", orderId)
      .eq("student_id", user.id)
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

    const reconciled = await reconcileCourseOrderPaid({
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

    return NextResponse.json({ ok: true, idempotent: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify course payment" },
      { status: 500 }
    );
  }
}
