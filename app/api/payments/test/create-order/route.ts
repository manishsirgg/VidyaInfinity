import { NextResponse } from "next/server";

import { razorpay } from "@/lib/payments/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";

export async function POST(request: Request) {

  const missingTables = await detectPaymentSchemaMismatches();
  if (missingTables.length) {
    return NextResponse.json(
      {
        error: "Supabase payment schema mismatch",
        missingTables,
        migration: "Run supabase/migrations/20260417_000001_payment_order_commission_foundation.sql",
      },
      { status: 500 }
    );
  }
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
