import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse();
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { testId, couponCode } = await request.json();

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: test } = await admin.data.from("psychometric_tests").select("id,price,is_active").eq("id", testId).single();

    if (!test || !test.is_active) return NextResponse.json({ error: "Invalid test" }, { status: 400 });

    let finalAmount = Number(test.price);
    let discountAmount = 0;

    if (couponCode) {
      const { data: coupon } = await admin.data
        .from("coupons")
        .select("code,discount_percentage,is_active")
        .eq("code", couponCode)
        .eq("is_active", true)
        .maybeSingle();

      if (coupon?.discount_percentage) {
        discountAmount = (finalAmount * Number(coupon.discount_percentage)) / 100;
        finalAmount = Math.max(0, finalAmount - discountAmount);
      }
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      notes: {
        userId: user.id,
        testId,
      },
    });

    const { error: insertOrderError } = await admin.data.from("psychometric_orders").insert({
      user_id: user.id,
      test_id: test.id,
      payment_status: "created",
      base_amount: test.price,
      discount_amount: discountAmount,
      final_paid_amount: finalAmount,
      coupon_code: couponCode ?? null,
      currency: "INR",
      razorpay_order_id: order.id,
      metadata: { source: "test_create_order_api" },
    });

    if (insertOrderError) return NextResponse.json({ error: insertOrderError.message }, { status: 500 });

    return NextResponse.json({ order, finalAmount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create psychometric order" },
      { status: 500 }
    );
  }
}
