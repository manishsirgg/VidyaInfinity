import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,payout_amount,platform_fee_amount")
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
    }>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ ok: true, idempotent: true });

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

  if (!signatureResult.valid) {
    await admin.data.from("webinar_orders").update({ payment_status: "failed", order_status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.data
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
    .in("payment_status", ["pending", "failed"]);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: registrationError } = await admin.data.from("webinar_registrations").upsert(
    {
      webinar_id: order.webinar_id,
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

  await createAccountNotification({
    userId: auth.user.id,
    type: "resubmission",
    title: "Webinar payment successful",
    message: "Your webinar payment was successful and access is now granted.",
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
