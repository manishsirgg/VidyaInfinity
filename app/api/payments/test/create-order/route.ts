import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getCouponErrorMessage, normalizeCouponCode, validateCouponForScope } from "@/lib/coupons";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "psychometric"]);
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { profile } = auth;
    const { testId, couponCode } = await request.json();

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: test } = await admin.data.from("psychometric_tests").select("id,price,is_active").eq("id", testId).single();

    if (!test || !test.is_active) return NextResponse.json({ error: "Invalid test" }, { status: 400 });

    const [{ data: paidOrder }, { data: unlockedAttempt }] = await Promise.all([
      admin.data
        .from("psychometric_orders")
        .select("id")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .eq("payment_status", "paid")
        .limit(1)
        .maybeSingle(),
      admin.data
        .from("test_attempts")
        .select("id,status")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .eq("status", "unlocked")
        .limit(1)
        .maybeSingle(),
    ]);

    if (paidOrder || unlockedAttempt) {
      console.info("[payments/test/create-order] psychometric_purchase_disabled_existing_active_access", {
        event: "psychometric_purchase_disabled_existing_active_access",
        userId: profile.id,
        testId: test.id,
        paidOrderId: paidOrder?.id ?? null,
        unlockedAttemptId: unlockedAttempt?.id ?? null,
      });
      return NextResponse.json({ error: "You have already purchased this assessment." }, { status: 409 });
    }

    let finalAmount = Number(test.price);
    let discountAmount = 0;

    const normalizedCouponCode = normalizeCouponCode(couponCode);

    let couponId: string | null = null;
    let discountPercent = 0;

    if (normalizedCouponCode) {
      const { data: coupon } = await admin.data
        .from("coupons")
        .select("id,code,discount_percent,active,expiry_date,applies_to")
        .eq("code", normalizedCouponCode)
        .eq("applies_to", "psychometric")
        .maybeSingle();

      const couponCheck = validateCouponForScope(coupon, "psychometric");
      if (!couponCheck.ok || !coupon) {
        const reason = couponCheck.ok ? "Coupon not found" : couponCheck.reason;
        return NextResponse.json({ error: getCouponErrorMessage(reason) }, { status: 400 });
      }

      couponId = coupon.id;
      discountPercent = Number(coupon.discount_percent);
      discountAmount = Number(((finalAmount * discountPercent) / 100).toFixed(2));
      finalAmount = Math.max(0, Number((finalAmount - discountAmount).toFixed(2)));
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      notes: {
        userId: profile.id,
        testId,
      },
    });

    const localOrderId = crypto.randomUUID();
    const { error: insertOrderError } = await admin.data.from("psychometric_orders").insert({
      id: localOrderId,
      user_id: profile.id,
      test_id: test.id,
      coupon_id: couponId,
      order_kind: "psychometric_test",
      payment_status: "created",
      base_amount: test.price,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      currency: "INR",
      razorpay_order_id: order.id,
      metadata: { source: "test_create_order_api" },
    });

    if (insertOrderError) return NextResponse.json({ error: insertOrderError.message }, { status: 500 });

    return NextResponse.json({ order, finalAmount, localOrderId, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create psychometric order" },
      { status: 500 }
    );
  }
}
