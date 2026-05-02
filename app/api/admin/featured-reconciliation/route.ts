import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const [inst, course, webinar] = await Promise.all([
    admin.data.from("featured_listing_orders").select("id,institute_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("course_featured_orders").select("id,institute_id,course_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("webinar_featured_orders").select("id,institute_id,webinar_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const instituteOrders = inst.data ?? [];
  const instituteOrderIds = instituteOrders.map((row) => row.id);
  const { data: instituteSubs } = instituteOrderIds.length
    ? await admin.data.from("institute_featured_subscriptions").select("id,order_id,status").in("order_id", instituteOrderIds)
    : { data: [] as Array<{ id: string; order_id: string | null; status: string | null }> };
  const subByOrderId = new Map(
    (instituteSubs ?? [])
      .filter((row): row is { id: string; order_id: string; status: string | null } => Boolean(row.order_id))
      .map((row) => [row.order_id, row]),
  );
  const toRow = (
    orderType: "institute" | "course" | "webinar",
    row: Record<string, unknown>,
    missingSubscription = false,
    subscription?: { id: string; status: string | null } | null,
  ) => ({
    ...row,
    orderType,
    orderId: row.id,
    targetId: orderType === "institute" ? row.institute_id : orderType === "course" ? row.course_id : row.webinar_id,
    instituteId: row.institute_id,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    missing_subscription: missingSubscription,
    subscription_id: subscription?.id ?? null,
    subscription_status: subscription?.status ?? null,
    issue_label: missingSubscription ? "Paid institute featured order missing subscription" : null,
    recommended_action: missingSubscription ? "Create missing active subscription" : null,
  });

  const markedInstituteOrders = instituteOrders.map((row) => {
    const subscription = subByOrderId.get(row.id);
    const missingSubscription = row.payment_status === "paid" && row.order_status === "confirmed" && !subscription;
    const computedIssue = missingSubscription ? "paid_needs_reconciliation" : "not_missing_subscription";
    console.info("[featured-reconciliation] institute_order_diagnostic", {
      orderId: row.id,
      payment_status: row.payment_status,
      order_status: row.order_status,
      subscription_id: subscription?.id ?? null,
      subscription_status: subscription?.status ?? null,
      computed_issue: computedIssue,
    });
    if (!missingSubscription) return null;
    return toRow("institute", row, true, subscription ?? null);
  }).filter((row): row is ReturnType<typeof toRow> => Boolean(row));

  const courseOrders = (course.data ?? []).map((row) => toRow("course", row));
  const webinarOrders = (webinar.data ?? []).map((row) => toRow("webinar", row));

  return NextResponse.json({ instituteOrders: markedInstituteOrders, courseOrders, webinarOrders });
}
