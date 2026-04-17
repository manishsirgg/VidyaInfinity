import { NextResponse } from "next/server";

import { razorpay } from "@/lib/payments/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { testId, userId, couponCode } = await request.json();

  const { data: test } = await supabaseAdmin
    .from("psychometric_tests")
    .select("id,price")
    .eq("id", testId)
    .single();

  if (!test) return NextResponse.json({ error: "Invalid test" }, { status: 400 });

  let finalAmount = test.price;

  if (couponCode) {
    const { data: coupon } = await supabaseAdmin
      .from("coupons")
      .select("id,discount_percentage,is_active")
      .eq("code", couponCode)
      .eq("is_active", true)
      .single();

    if (coupon?.discount_percentage) {
      finalAmount = Math.max(0, test.price - (test.price * coupon.discount_percentage) / 100);
    }
  }

  const order = await razorpay.orders.create({
    amount: Math.round(finalAmount * 100),
    currency: "INR",
    notes: { testId, userId, couponCode: couponCode ?? "" },
  });

  return NextResponse.json({ order, finalAmount });
}
