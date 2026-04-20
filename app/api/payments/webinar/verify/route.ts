import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyWebinarEnrollment } from "@/lib/webinars/enrollment-notifications";

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse();
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

  const { data: order } = await admin.data
    .from("webinar_orders")
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,payout_amount,platform_fee_amount,order_status,access_status")
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
      payout_amount: number;
      platform_fee_amount: number;
      order_status: string;
      access_status: string;
    }>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ ok: true, idempotent: true });
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

  const now = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await admin.data
    .from("webinar_orders")
    .update({
      payment_status: "paid",
      order_status: "confirmed",
      access_status: "granted",
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .in("payment_status", ["pending", "failed"])
    .neq("order_status", "cancelled")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updatedOrder) return NextResponse.json({ ok: true, idempotent: true });

  const { error: registrationError } = await admin.data.from("webinar_registrations").upsert(
    {
      webinar_id: order.webinar_id,
      institute_id: order.institute_id,
      student_id: order.student_id,
      webinar_order_id: order.id,
      registration_status: "registered",
      payment_status: "paid",
      access_status: "granted",
      registered_at: now,
    },
    { onConflict: "webinar_id,student_id" }
  );
  if (registrationError) return NextResponse.json({ error: registrationError.message }, { status: 500 });

  const { data: existingPayout } = await admin.data
    .from("institute_payouts")
    .select("id")
    .eq("webinar_order_id", order.id)
    .maybeSingle<{ id: string }>();

  if (!existingPayout) {
    const { error: payoutError } = await admin.data.from("institute_payouts").insert({
      institute_id: order.institute_id,
      webinar_order_id: order.id,
      payout_source: "webinar",
      gross_amount: order.amount,
      platform_fee_amount: order.platform_fee_amount,
      payout_amount: order.payout_amount,
      payout_status: "pending",
      source_reference_id: order.id,
      source_reference_type: "webinar_order",
    });
    if (payoutError) return NextResponse.json({ error: payoutError.message }, { status: 500 });
  }

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,institute_id")
    .eq("id", order.webinar_id)
    .maybeSingle<{ id: string; title: string; institute_id: string }>();

  if (webinar) {
    await notifyWebinarEnrollment({
      supabase: admin.data,
      webinarId: webinar.id,
      webinarTitle: webinar.title,
      studentId: auth.user.id,
      instituteId: webinar.institute_id,
      mode: "paid",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
