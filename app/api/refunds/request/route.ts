import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { parseRefundOrderType, toCanonicalOrderKind } from "@/lib/payments/order-kinds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REFUND_ELIGIBLE_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;
const REFUND_BLOCKING_STATUSES = ["requested", "processing", "refunded"] as const;

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { orderType: rawOrderType, orderId, reason } = await request.json();
  const orderType = parseRefundOrderType(rawOrderType);
  if (!orderType) {
    return NextResponse.json({ error: "Invalid orderType. Allowed values: course, psychometric, webinar." }, { status: 400 });
  }
  if (!orderId || !reason || !String(reason).trim()) {
    return NextResponse.json({ error: "orderId and reason are required" }, { status: 400 });
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
  } else if (orderType === "psychometric") {
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
  } else {
    const { data: order } = await admin.data
      .from("webinar_orders")
      .select("id,webinar_id,amount,payment_status,order_status,institute_id,razorpay_payment_id")
      .eq("id", orderId)
      .eq("student_id", auth.user.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Webinar order not found" }, { status: 404 });
    if (!REFUND_ELIGIBLE_PAYMENT_STATUSES.includes(String(order.payment_status ?? "").toLowerCase() as (typeof REFUND_ELIGIBLE_PAYMENT_STATUSES)[number])) {
      return NextResponse.json({ error: "Refund is allowed only for paid webinar orders" }, { status: 400 });
    }
    if (String(order.order_status ?? "").toLowerCase() !== "confirmed") {
      return NextResponse.json({ error: "Refund is allowed only for confirmed webinar orders" }, { status: 400 });
    }
    if (String(order.payment_status ?? "").toLowerCase() === "refunded") {
      return NextResponse.json({ error: "Webinar order is already refunded" }, { status: 409 });
    }

    const [{ data: registration, error: registrationError }, { data: webinar }] = await Promise.all([
      admin.data
      .from("webinar_registrations")
      .select("id,registration_status,access_status,access_granted_at,reveal_started_at,email_sent_at,whatsapp_sent_at")
      .eq("student_id", auth.user.id)
      .eq("webinar_order_id", orderId)
      .maybeSingle<{
        id: string;
        registration_status: string | null;
        access_status: string | null;
        access_granted_at: string | null;
        reveal_started_at: string | null;
        email_sent_at: string | null;
        whatsapp_sent_at: string | null;
      }>(),
      admin.data.from("webinars").select("id,starts_at").eq("id", order.webinar_id).maybeSingle<{ id: string; starts_at: string | null }>(),
    ]);
    if (registrationError) {
      return NextResponse.json({ error: registrationError.message }, { status: 500 });
    }
    const registrationStatus = String(registration?.registration_status ?? "").toLowerCase();
    const accessStatus = String(registration?.access_status ?? "").toLowerCase();
    if (["cancelled", "canceled", "revoked"].includes(registrationStatus) || ["revoked"].includes(accessStatus)) {
      return NextResponse.json({ error: "Refund is blocked for cancelled or revoked webinar registrations" }, { status: 409 });
    }
    const now = Date.now();
    const webinarStartsAt = webinar?.starts_at ? new Date(webinar.starts_at).getTime() : Number.NaN;
    if (Number.isFinite(webinarStartsAt) && now >= webinarStartsAt) {
      return NextResponse.json({ error: "Refund is blocked because webinar has already started." }, { status: 409 });
    }
    if (Number.isFinite(webinarStartsAt) && now >= webinarStartsAt - 30 * 60 * 1000) {
      return NextResponse.json({ error: "Refund is allowed only before 30 minutes of webinar start time." }, { status: 409 });
    }
    if (registration?.access_granted_at || registration?.reveal_started_at || registration?.email_sent_at || registration?.whatsapp_sent_at || ["granted", "revealed"].includes(accessStatus)) {
      console.info("[api/refunds/request] webinar_refund_blocked_due_to_access_release", {
        event: "webinar_refund_blocked_due_to_access_release",
        student_id: auth.user.id,
        webinar_order_id: orderId,
      });
      return NextResponse.json({ error: "Refunds are not available once webinar access details have been issued." }, { status: 409 });
    }

    refundAmount = Number(order.amount ?? 0);
    instituteId = order.institute_id ?? null;
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
      : orderType === "psychometric"
        ? blockingRefundQuery.eq("psychometric_order_id", orderId)
        : blockingRefundQuery.eq("webinar_order_id", orderId);

  const { count: blockingRefundCount, error: blockingRefundError } = await scopedBlockingRefundQuery;
  if (blockingRefundError) return NextResponse.json({ error: blockingRefundError.message }, { status: 500 });
  if ((blockingRefundCount ?? 0) > 0) {
    return NextResponse.json({ error: "A refund already exists for this order." }, { status: 409 });
  }

  const insertPayload = {
    user_id: auth.user.id,
    institute_id: instituteId,
    order_kind: toCanonicalOrderKind(orderType),
    course_order_id: orderType === "course" ? orderId : null,
    psychometric_order_id: orderType === "psychometric" ? orderId : null,
    webinar_order_id: orderType === "webinar" ? orderId : null,
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
