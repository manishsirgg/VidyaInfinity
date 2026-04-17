import { NextResponse } from "next/server";

import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { orderId, paymentId, signature, userId, testId, finalPaidAmount, couponCode } = await request.json();

  if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("test_purchases").insert({
    user_id: userId,
    test_id: testId,
    payment_status: "successful",
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    coupon_code: couponCode,
    final_paid_amount: finalPaidAmount,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
