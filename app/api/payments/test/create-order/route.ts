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

    const { data: activePaidAttempt } = await admin.data
      .from("test_attempts")
      .select("id,status")
      .eq("user_id", profile.id)
      .eq("test_id", test.id)
      .in("status", ["not_started", "unlocked", "in_progress", "submitted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activePaidAttempt) {
      return NextResponse.json({ error: "You already have an active attempt for this assessment." }, { status: 409 });
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

    const { data: reusableOrder } = await admin.data
      .from("psychometric_orders")
      .select("id")
      .eq("user_id", profile.id)
      .eq("test_id", test.id)
      .in("payment_status", ["created", "failed"])
      .is("paid_at", null)
      .is("attempt_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    const localOrderId = reusableOrder?.id ?? crypto.randomUUID();

    const payload = {
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
      razorpay_payment_id: null,
      razorpay_signature: null,
      metadata: { source: "test_create_order_api" },
    };
    const orderMutation = reusableOrder
      ? await admin.data.from("psychometric_orders").update(payload).eq("id", reusableOrder.id)
      : await admin.data.from("psychometric_orders").insert(payload);

    if (orderMutation.error) return NextResponse.json({ error: orderMutation.error.message }, { status: 500 });

    return NextResponse.json({ order, finalAmount, localOrderId, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create psychometric order" },
      { status: 500 }
    );
  }
}
