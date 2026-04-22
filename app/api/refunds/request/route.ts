import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REFUND_ELIGIBLE_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;
const REFUND_OPEN_STATUSES = ["requested", "processing"] as const;

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { orderType, orderId, reason } = await request.json();
  if (!["course", "psychometric"].includes(orderType) || !orderId || !reason) {
    return NextResponse.json({ error: "orderType, orderId, reason are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  let refundAmount: number | null = null;
  let instituteId: string | null = null;

  if (orderType === "course") {
    const { data: order } = await admin.data
      .from("course_orders")
      .select("id,gross_amount,institute_id")
      .eq("id", orderId)
      .eq("student_id", auth.user.id)
      .in("payment_status", [...REFUND_ELIGIBLE_PAYMENT_STATUSES])
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Eligible course order not found" }, { status: 404 });
    refundAmount = Number(order.gross_amount ?? 0);
    instituteId = order.institute_id ?? null;
  } else {
    const { data: order } = await admin.data
      .from("psychometric_orders")
      .select("id,final_paid_amount")
      .eq("id", orderId)
      .eq("user_id", auth.user.id)
      .in("payment_status", [...REFUND_ELIGIBLE_PAYMENT_STATUSES])
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Eligible psychometric order not found" }, { status: 404 });
    refundAmount = Number(order.final_paid_amount ?? 0);
  }

  const openRefundQuery = admin.data
    .from("refunds")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", auth.user.id)
    .in("refund_status", [...REFUND_OPEN_STATUSES]);

  const scopedOpenRefundQuery =
    orderType === "course"
      ? openRefundQuery.eq("course_order_id", orderId)
      : openRefundQuery.eq("psychometric_order_id", orderId);

  const { count: openRefundCount, error: openRefundError } = await scopedOpenRefundQuery;
  if (openRefundError) return NextResponse.json({ error: openRefundError.message }, { status: 500 });
  if ((openRefundCount ?? 0) > 0) {
    return NextResponse.json({ error: "A refund request is already open for this order." }, { status: 409 });
  }

  const { error } = await admin.data.from("refunds").insert({
    user_id: auth.user.id,
    institute_id: instituteId,
    order_kind: orderType === "course" ? "course_enrollment" : "psychometric_test",
    course_order_id: orderType === "course" ? orderId : null,
    psychometric_order_id: orderType === "psychometric" ? orderId : null,
    amount: refundAmount ?? 0,
    reason,
    refund_status: "requested",
    requested_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
