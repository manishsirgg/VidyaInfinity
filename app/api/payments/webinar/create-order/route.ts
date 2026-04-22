import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getCouponErrorMessage, normalizeCouponCode, validateCouponForScope } from "@/lib/coupons";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "webinar"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { webinarId, couponCode } = (await request.json()) as { webinarId?: string; couponCode?: string };
  if (!webinarId) return NextResponse.json({ error: "webinarId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,institute_id,webinar_mode,price,currency,approval_status,status,ends_at,is_public")
    .eq("id", webinarId)
    .maybeSingle<{
      id: string;
      title: string;
      institute_id: string;
      webinar_mode: string;
      price: number;
      currency: string;
      approval_status: string;
      status: string;
      ends_at: string | null;
      is_public: boolean | null;
    }>();

  if (!webinar || webinar.approval_status !== "approved" || webinar.is_public !== true) return NextResponse.json({ error: "Webinar unavailable" }, { status: 404 });
  if (webinar.webinar_mode !== "paid") return NextResponse.json({ error: "This webinar is free" }, { status: 400 });
  if (!["scheduled", "live"].includes(webinar.status)) return NextResponse.json({ error: "This webinar is not open for enrollment" }, { status: 400 });
  if (webinar.ends_at && new Date(webinar.ends_at).getTime() <= Date.now()) return NextResponse.json({ error: "This webinar has ended" }, { status: 400 });

  const { data: existingPaid } = await admin.data
    .from("webinar_orders")
    .select("id,paid_at")
    .eq("webinar_id", webinar.id)
    .eq("student_id", auth.user.id)
    .eq("payment_status", "paid")
    .maybeSingle();

  if (existingPaid) return NextResponse.json({ error: "Already purchased" }, { status: 409 });

  const { data: existingRegistration } = await admin.data
    .from("webinar_registrations")
    .select("id,access_end_at")
    .eq("webinar_id", webinar.id)
    .eq("student_id", auth.user.id)
    .eq("access_status", "granted")
    .or("access_end_at.is.null,access_end_at.gte.now()")
    .maybeSingle();

  if (existingRegistration) {
    console.info("[payments/webinar/create-order] webinar_purchase_disabled_existing_active_registration", {
      event: "webinar_purchase_disabled_existing_active_registration",
      webinarId: webinar.id,
      studentId: auth.user.id,
      registrationId: existingRegistration.id,
      accessEndAt: existingRegistration.access_end_at,
    });
    return NextResponse.json({ error: "Already enrolled with active access." }, { status: 409 });
  }

  const { data: webinarCommission, error: webinarCommissionError } = await admin.data
    .from("webinar_commission_settings")
    .select("commission_percent")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ commission_percent: number }>();

  if (webinarCommissionError) {
    return NextResponse.json({ error: `Unable to read webinar commission settings: ${webinarCommissionError.message}` }, { status: 500 });
  }

  const commissionPercentage = sanitizeCommissionPercentage(webinarCommission?.commission_percent);
  if (commissionPercentage === null) {
    return NextResponse.json({ error: "Webinar commission is not configured" }, { status: 500 });
  }

  const normalizedCouponCode = normalizeCouponCode(couponCode);
  let discountAmount = 0;
  let appliedCouponCode: string | null = null;
  const grossAmount = Number(webinar.price ?? 0);

  if (normalizedCouponCode) {
    const { data: coupon } = await admin.data
      .from("coupons")
      .select("code,discount_percent,active,expiry_date,applies_to")
      .eq("code", normalizedCouponCode)
      .eq("applies_to", "webinar")
      .maybeSingle();

    const couponCheck = validateCouponForScope(coupon, "webinar");
    if (!couponCheck.ok || !coupon) {
      const reason = couponCheck.ok ? "Coupon not found" : couponCheck.reason;
      return NextResponse.json({ error: getCouponErrorMessage(reason) }, { status: 400 });
    }

    discountAmount = Math.max(0, Number(((grossAmount * Number(coupon.discount_percent)) / 100).toFixed(2)));
    appliedCouponCode = coupon.code;
  }

  const discountedAmount = Math.max(0, grossAmount - discountAmount);
  const commission = calculateCommission(discountedAmount, commissionPercentage);

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  const order = await razorpay.data.orders.create({
    amount: Math.round(commission.grossAmount * 100),
    currency: webinar.currency || "INR",
    receipt: `webinar_${webinar.id.slice(0, 8)}_${Date.now()}`,
    notes: {
      webinarId: webinar.id,
      studentId: auth.user.id,
      instituteId: webinar.institute_id,
    },
  });

  const { data: inserted, error: insertError } = await admin.data
    .from("webinar_orders")
    .insert({
      webinar_id: webinar.id,
      student_id: auth.user.id,
      institute_id: webinar.institute_id,
      amount: commission.grossAmount,
      currency: webinar.currency || "INR",
      payment_status: "pending",
      order_status: "pending",
      access_status: "locked",
      platform_fee_percent: commission.commissionPercentage,
      platform_fee_amount: commission.commissionAmount,
      payout_amount: commission.instituteReceivable,
      razorpay_order_id: order.id,
      razorpay_receipt: order.receipt ?? null,
      metadata: {
        source: "webinar_create_order_api",
        coupon_code: appliedCouponCode,
        coupon_discount_amount: discountAmount,
        base_amount: grossAmount,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ order, orderRecordId: inserted.id });
}
