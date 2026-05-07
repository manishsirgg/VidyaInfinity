import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getCouponErrorMessage, isCouponExpired, normalizeCouponCode } from "@/lib/coupons";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function toPaise(amount: number) {
  return Math.max(0, Math.round((amount + Number.EPSILON) * 100));
}

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "psychometric"]);
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { profile } = auth;
    const { testId, couponCode, validateOnly } = await request.json();

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

    const baseAmount = Number(test.price);
    let finalAmount = Number(baseAmount.toFixed(2));
    let discountAmount = 0;

    const normalizedCouponCode = normalizeCouponCode(couponCode);

    let couponId: string | null = null;
    let discountPercent = 0;
    let couponMeta: { code: string; applies_to: string | null } | null = null;

    if (normalizedCouponCode) {
      const { data: coupon } = await admin.data
        .from("coupons")
        .select("id,code,discount_percent,active,expiry_date,applies_to,is_deleted,deleted_at,max_uses,used_count")
        .eq("is_deleted", false)
        .is("deleted_at", null)
        .gte("expiry_date", new Date().toISOString().slice(0, 10))
        .filter("code", "ilike", normalizedCouponCode)
        .maybeSingle();

      if (!coupon) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon not found") }, { status: 400 });
      }
      if (coupon.applies_to !== "psychometric") {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon is not valid for psychometric") }, { status: 400 });
      }
      if (!coupon.active) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon is inactive") }, { status: 400 });
      }
      if (coupon.is_deleted || coupon.deleted_at) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon is deleted") }, { status: 400 });
      }
      if (isCouponExpired(coupon.expiry_date)) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon has expired") }, { status: 400 });
      }
      if (coupon.max_uses !== null && coupon.max_uses !== undefined && (coupon.used_count ?? 0) >= coupon.max_uses) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon usage limit reached") }, { status: 400 });
      }
      if (!coupon.discount_percent || coupon.discount_percent <= 0) {
        return NextResponse.json({ error: getCouponErrorMessage("Coupon discount is invalid") }, { status: 400 });
      }

      couponId = coupon.id;
      discountPercent = Number(coupon.discount_percent);
      discountAmount = Number(((baseAmount * discountPercent) / 100).toFixed(2));
      finalAmount = Math.max(0, Number((baseAmount - discountAmount).toFixed(2)));
      couponMeta = { code: coupon.code, applies_to: coupon.applies_to };
    }

    if (finalAmount <= 0) {
      return NextResponse.json(
        { error: "This coupon cannot be used for online payment because payable amount is zero. Please contact support." },
        { status: 400 }
      );
    }

    if (validateOnly) {
      return NextResponse.json({
        ok: true,
        pricing: { baseAmount, discountPercent, discountAmount, finalAmount, finalAmountPaise: toPaise(finalAmount) },
        coupon: couponMeta,
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: toPaise(finalAmount),
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
      base_amount: baseAmount,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      currency: "INR",
      razorpay_order_id: order.id,
      razorpay_payment_id: null,
      razorpay_signature: null,
      metadata: { source: "test_create_order_api", coupon: couponMeta },
    };
    const orderMutation = reusableOrder
      ? await admin.data.from("psychometric_orders").update(payload).eq("id", reusableOrder.id)
      : await admin.data.from("psychometric_orders").insert(payload);

    if (orderMutation.error) return NextResponse.json({ error: orderMutation.error.message }, { status: 500 });

    return NextResponse.json({
      order,
      localOrderId,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? null,
      pricing: { baseAmount, discountPercent, discountAmount, finalAmount, finalAmountPaise: toPaise(finalAmount) },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create psychometric order" },
      { status: 500 }
    );
  }
}
