import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REFUND_ELIGIBLE_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;
const REFUND_BLOCKING_STATUSES = ["requested", "processing", "refunded"] as const;

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { orderType, orderId, reason } = await request.json();
  if (!["course", "psychometric"].includes(orderType) || !orderId || !reason || !String(reason).trim()) {
    return NextResponse.json({ error: "orderType, orderId, reason are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  let refundAmount = 0;
  let instituteId: string | null = null;
  let razorpayPaymentId: string | null = null;

  if (orderType === "course") {
    const { data: order } = await admin.data
      .from("course_orders")
      .select("id,gross_amount,payment_status,institute_id,razorpay_payment_id")
      .eq("id", orderId)
      .eq("student_id", auth.user.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Course order not found" }, { status: 404 });
    if (!REFUND_ELIGIBLE_PAYMENT_STATUSES.includes(String(order.payment_status ?? "").toLowerCase() as (typeof REFUND_ELIGIBLE_PAYMENT_STATUSES)[number])) {
      return NextResponse.json({ error: "Refund is allowed only for paid orders" }, { status: 400 });
    }
    if (String(order.payment_status ?? "").toLowerCase() === "refunded") {
      return NextResponse.json({ error: "Order is already refunded" }, { status: 409 });
    }

    refundAmount = Number(order.gross_amount ?? 0);
    instituteId = order.institute_id ?? null;
    razorpayPaymentId = order.razorpay_payment_id ?? null;
  } else {
    const { data: order } = await admin.data
      .from("psychometric_orders")
      .select("id,final_paid_amount,payment_status,razorpay_payment_id")
      .eq("id", orderId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Psychometric order not found" }, { status: 404 });
    if (!REFUND_ELIGIBLE_PAYMENT_STATUSES.includes(String(order.payment_status ?? "").toLowerCase() as (typeof REFUND_ELIGIBLE_PAYMENT_STATUSES)[number])) {
      return NextResponse.json({ error: "Refund is allowed only for paid orders" }, { status: 400 });
    }
    if (String(order.payment_status ?? "").toLowerCase() === "refunded") {
      return NextResponse.json({ error: "Order is already refunded" }, { status: 409 });
    }

    refundAmount = Number(order.final_paid_amount ?? 0);
    razorpayPaymentId = order.razorpay_payment_id ?? null;
  }

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return NextResponse.json({ error: "Refund amount is invalid for this order" }, { status: 400 });
  }

  if (!razorpayPaymentId) {
    return NextResponse.json({ error: "Order is missing Razorpay payment reference" }, { status: 400 });
  }

  const blockingRefundQuery = admin.data
    .from("refunds")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", auth.user.id)
    .in("refund_status", [...REFUND_BLOCKING_STATUSES]);

  const scopedBlockingRefundQuery =
    orderType === "course"
      ? blockingRefundQuery.eq("course_order_id", orderId)
      : blockingRefundQuery.eq("psychometric_order_id", orderId);

  const { count: blockingRefundCount, error: blockingRefundError } = await scopedBlockingRefundQuery;
  if (blockingRefundError) return NextResponse.json({ error: blockingRefundError.message }, { status: 500 });
  if ((blockingRefundCount ?? 0) > 0) {
    return NextResponse.json({ error: "A refund already exists for this order." }, { status: 409 });
  }

  const insertPayload = {
    user_id: auth.user.id,
    institute_id: instituteId,
    order_kind: orderType === "course" ? "course_enrollment" : "psychometric_test",
    course_order_id: orderType === "course" ? orderId : null,
    psychometric_order_id: orderType === "psychometric" ? orderId : null,
    amount: refundAmount,
    reason: String(reason).trim(),
    internal_notes: null,
    refund_status: "requested",
    razorpay_payment_id: razorpayPaymentId,
    requested_at: new Date().toISOString(),
    metadata: { source: "student_request" },
  };

  const { error } = await admin.data.from("refunds").insert(insertPayload);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A refund already exists for this order." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
