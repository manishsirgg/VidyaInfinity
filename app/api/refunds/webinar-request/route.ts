import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { REFUND_ORDER_TYPE_TO_CANONICAL_KIND } from "@/lib/payments/order-kinds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REFUND_BLOCKING_STATUSES = ["requested", "processing", "refunded"] as const;
const REFUND_INELIGIBLE_ACCESS_STATUSES = ["refunded", "revoked"] as const;

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { webinarOrderId, reason } = await request.json();

  console.info("[api/refunds/webinar-request] webinar_refund_request_started", {
    event: "webinar_refund_request_started",
    student_id: auth.user.id,
    webinar_order_id: webinarOrderId ?? null,
  });

  if (!webinarOrderId || !reason || !String(reason).trim()) {
    return NextResponse.json({ error: "webinarOrderId and reason are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    console.error("[api/refunds/webinar-request] webinar_refund_request_failed", {
      event: "webinar_refund_request_failed",
      student_id: auth.user.id,
      webinar_order_id: webinarOrderId,
      error: admin.error,
    });
    return NextResponse.json({ error: admin.error }, { status: 500 });
  }

  const { data: order } = await admin.data
    .from("webinar_orders")
    .select("id,webinar_id,amount,payment_status,order_status,access_status,institute_id,razorpay_payment_id")
    .eq("id", webinarOrderId)
    .eq("student_id", auth.user.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Webinar order not found" }, { status: 404 });

  const normalizedPaymentStatus = String(order.payment_status ?? "").toLowerCase();
  const normalizedOrderStatus = String(order.order_status ?? "").toLowerCase();
  const normalizedAccessStatus = String(order.access_status ?? "").toLowerCase();

  if (normalizedPaymentStatus !== "paid") {
    return NextResponse.json({ error: "Refund is allowed only for paid webinar orders" }, { status: 400 });
  }
  if (normalizedOrderStatus !== "confirmed") {
    return NextResponse.json({ error: "Refund is allowed only for confirmed webinar orders" }, { status: 400 });
  }
  if (REFUND_INELIGIBLE_ACCESS_STATUSES.includes(normalizedAccessStatus as (typeof REFUND_INELIGIBLE_ACCESS_STATUSES)[number])) {
    return NextResponse.json({ error: "Refund is not allowed for this webinar order status" }, { status: 409 });
  }
  if (!order.razorpay_payment_id) {
    return NextResponse.json({ error: "Order is missing Razorpay payment reference" }, { status: 400 });
  }

  const { count: blockingRefundCount, error: blockingRefundError } = await admin.data
    .from("refunds")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", auth.user.id)
    .eq("webinar_order_id", webinarOrderId)
    .in("refund_status", [...REFUND_BLOCKING_STATUSES]);

  if (blockingRefundError) {
    console.error("[api/refunds/webinar-request] webinar_refund_request_failed", {
      event: "webinar_refund_request_failed",
      student_id: auth.user.id,
      webinar_order_id: webinarOrderId,
      error: blockingRefundError.message,
    });
    return NextResponse.json({ error: blockingRefundError.message }, { status: 500 });
  }
  if ((blockingRefundCount ?? 0) > 0) {
    return NextResponse.json({ error: "A refund already exists for this webinar order." }, { status: 409 });
  }

  const { error: insertError } = await admin.data.from("refunds").insert({
    order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.webinar,
    webinar_order_id: webinarOrderId,
    user_id: auth.user.id,
    institute_id: order.institute_id ?? null,
    amount: Number(order.amount ?? 0),
    reason: String(reason).trim(),
    refund_status: "requested",
    razorpay_payment_id: order.razorpay_payment_id,
    requested_at: new Date().toISOString(),
    metadata: { source: "student_webinar_request" },
  });

  if (insertError) {
    console.error("[api/refunds/webinar-request] webinar_refund_request_failed", {
      event: "webinar_refund_request_failed",
      student_id: auth.user.id,
      webinar_order_id: webinarOrderId,
      error: insertError.message,
      code: insertError.code,
    });

    if (insertError.code === "23505") {
      return NextResponse.json({ error: "A refund already exists for this webinar order." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  console.info("[api/refunds/webinar-request] webinar_refund_request_succeeded", {
    event: "webinar_refund_request_succeeded",
    student_id: auth.user.id,
    webinar_order_id: webinarOrderId,
  });

  return NextResponse.json({ ok: true, message: "Refund request submitted successfully." });
}
