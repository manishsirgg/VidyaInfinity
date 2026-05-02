import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder, fetchRazorpayPaymentForOrder, type FeaturedOrderType } from "@/lib/featured-reconciliation";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const body = (await request.json()) as { orderType: FeaturedOrderType; orderId: string };
  const actorUserId = auth.user.id;
  const { orderType, orderId } = body;
  console.log("[admin/featured-reconciliation/reconcile] received", { orderType, orderId, actorUserId });
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const orderTable = orderType === "institute" ? "featured_listing_orders" : orderType === "course" ? "course_featured_orders" : "webinar_featured_orders";
  const { data: orderRow, error: orderError } = await admin.data.from(orderTable).select("id,payment_status,order_status,razorpay_order_id,razorpay_payment_id").eq("id", orderId).maybeSingle<{ id: string; payment_status: string; order_status: string; razorpay_order_id: string | null; razorpay_payment_id: string | null }>();
  if (orderError) return NextResponse.json({ success: false, message: "Order lookup failed", action_taken: "lookup_error", orderType, orderId, error: orderError.message }, { status: 500 });
  if (!orderRow) return NextResponse.json({ success: false, message: "Order not found", action_taken: "lookup_not_found", orderType, orderId, error: "Order not found" }, { status: 404 });
  const shouldActivateLocalPaid = orderType === "institute" && orderRow.payment_status === "paid" && orderRow.order_status === "confirmed" && Boolean(orderRow.razorpay_payment_id);
  let paymentIdForActivation = orderRow?.razorpay_payment_id ?? undefined;
  if (!shouldActivateLocalPaid) {
    if (!orderRow.razorpay_order_id) return NextResponse.json({ success: false, message: "Razorpay order id missing", action_taken: "blocked_missing_razorpay_order_id", orderType, orderId, error: "Razorpay order id missing" }, { status: 400 });
    const fetched = await fetchRazorpayPaymentForOrder(orderRow.razorpay_order_id);
    if (!fetched.ok) return NextResponse.json({ success: false, message: "Razorpay fetch failed", action_taken: "razorpay_fetch_failed", orderType, orderId, error: fetched.error }, { status: 502 });
    if (!fetched.paymentId) return NextResponse.json({ success: true, message: "Payment still pending", action_taken: "pending_no_captured_payment", orderType, orderId });
    paymentIdForActivation = fetched.paymentId;
  }
  const act = await activateFeaturedSubscriptionFromPaidOrder({ supabase: admin.data, orderType, orderId, razorpayOrderId: orderRow.razorpay_order_id ?? undefined, razorpayPaymentId: paymentIdForActivation, source: "admin_reconciliation", actorUserId, reason: "Paid confirmed local order missing subscription" });
  if (!act.ok) return NextResponse.json({ success: false, message: "Activation failed", action_taken: "activation_failed", orderType, orderId, error: act.error }, { status: 500 });
  return NextResponse.json({ success: true, message: act.idempotent ? "Subscription already exists for this order." : "Reconciliation completed and subscription activated.", action_taken: act.idempotent ? "already_exists" : "activated_subscription", orderType, orderId, subscription_id: act.subscriptionId ?? undefined });
}
