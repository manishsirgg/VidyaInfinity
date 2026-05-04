import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder, fetchRazorpayPaymentForOrder, type FeaturedOrderType } from "@/lib/featured-reconciliation";

export async function POST(request: Request) {
  let debugStage = "route_hit";
  try {
    const auth = await requireApiUser("admin");
    if ("error" in auth) return auth.error;
    const body = (await request.json()) as { orderType: FeaturedOrderType; orderId: string; issue?: string };
    debugStage = "body_parsed";
    const actorUserId = auth.user.id;
    debugStage = "admin_verified";
    const { orderType, orderId, issue } = body;
    if (issue === "duplicate_paid_scheduled_upgrade") {
      const orderTableX = orderType === "course" ? "course_featured_orders" : orderType === "webinar" ? "webinar_featured_orders" : null;
      if (!orderTableX) return NextResponse.json({ success: false, message: "Manual decision required for duplicate scheduled upgrade." }, { status: 409 });
    }
    console.log("[admin/featured-reconciliation/reconcile] received", { orderType, orderId, actorUserId });

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ success: false, message: "Reconciliation failed", error: admin.error, debug_stage: debugStage }, { status: 500 });

    const orderTable = orderType === "institute" ? "featured_listing_orders" : orderType === "course" ? "course_featured_orders" : "webinar_featured_orders";
    const { data: orderRow, error: orderError } = await admin.data
      .from(orderTable)
      .select("*")
      .eq("id", orderId)
      .maybeSingle<Record<string, unknown>>();

    debugStage = "order_loaded";

    if (orderType === "institute") {
      console.log("[admin reconcile] institute order lookup", {
        orderId,
        table: "featured_listing_orders",
        found: Boolean(orderRow),
        error: orderError,
      });
      if (!orderRow) {
        return NextResponse.json({
          success: false,
          message: "Order not found in featured_listing_orders",
          debug_stage: "route_order_lookup",
          received: { orderType, orderId },
          expected_table: "featured_listing_orders",
          expected_column: "id",
          supabase_error: orderError,
        }, { status: 404 });
      }
    }

    if (orderError) return NextResponse.json({ success: false, message: "Order lookup failed", action_taken: "lookup_error", orderType, orderId, error: orderError.message, debug_stage: debugStage }, { status: 500 });
    if (!orderRow) return NextResponse.json({ success: false, message: "Order not found", debug_stage: "order_loaded", received: { orderType, orderId }, expected_table: orderTable }, { status: 404 });

    const paymentStatus = String(orderRow.payment_status ?? "").toLowerCase();
    const orderStatus = String(orderRow.order_status ?? "").toLowerCase();
    const razorpayPaymentId = typeof orderRow.razorpay_payment_id === "string" ? orderRow.razorpay_payment_id : null;
    const razorpayOrderId = typeof orderRow.razorpay_order_id === "string" ? orderRow.razorpay_order_id : null;
    const shouldActivateLocalPaid = orderType === "institute" && paymentStatus === "paid" && orderStatus === "confirmed" && Boolean(razorpayPaymentId);

    let paymentIdForActivation = razorpayPaymentId ?? undefined;
    if (shouldActivateLocalPaid) debugStage = "local_paid_fast_path";
    if (!shouldActivateLocalPaid) {
      if (!razorpayOrderId) return NextResponse.json({ success: false, message: "Razorpay order id missing", action_taken: "blocked_missing_razorpay_order_id", orderType, orderId, error: "Razorpay order id missing", debug_stage: debugStage }, { status: 400 });
      const fetched = await fetchRazorpayPaymentForOrder(razorpayOrderId);
      if (!fetched.ok) return NextResponse.json({ success: false, message: "Razorpay fetch failed", action_taken: "razorpay_fetch_failed", orderType, orderId, error: fetched.error, debug_stage: debugStage }, { status: 502 });
      if (!fetched.paymentId) return NextResponse.json({ success: true, message: "Payment still pending", action_taken: "pending_no_captured_payment", orderType, orderId, debug_stage: debugStage });
      paymentIdForActivation = fetched.paymentId;
    }

    debugStage = "activation_helper_called";
    const act = await activateFeaturedSubscriptionFromPaidOrder({ supabase: admin.data, orderType, orderId, razorpayOrderId: razorpayOrderId ?? undefined, razorpayPaymentId: paymentIdForActivation, source: "admin_reconciliation", actorUserId, reason: "Paid confirmed local order missing subscription" });

    if (!act.ok && orderType === "institute" && String(act.error ?? "").includes("Order not found")) {
      const hasSubscription = Boolean(orderRow.subscription_id);
      const fallbackEligible = !hasSubscription && paymentStatus === "paid" && orderStatus === "confirmed" && Boolean(razorpayPaymentId);
      if (fallbackEligible) {
        debugStage = "direct_fallback";
        const { data: plan, error: planError } = await admin.data
          .from("featured_listing_plans")
          .select("id,plan_code,price,currency,duration_days")
          .eq("id", String(orderRow.plan_id ?? ""))
          .maybeSingle<{ id: string; plan_code: string; price: number | null; currency: string | null; duration_days: number | null }>();
        if (planError || !plan) {
          return NextResponse.json({ success: false, message: "Activation failed", action_taken: "activation_failed", orderType, orderId, error: planError?.message ?? "Plan not found", debug_stage: debugStage }, { status: 500 });
        }
        const now = new Date();
        const durationDays = Number(orderRow.duration_days ?? plan.duration_days ?? 0);
        const endsAt = new Date(now.getTime() + durationDays * 86400000).toISOString();
        const { data: inserted, error: insertError } = await admin.data
          .from("institute_featured_subscriptions")
          .insert({
            institute_id: orderRow.institute_id,
            created_by: orderRow.created_by,
            plan_code: plan.plan_code,
            amount: Number(orderRow.final_payable_amount ?? orderRow.amount ?? plan.price ?? 0),
            currency: orderRow.currency ?? plan.currency ?? "INR",
            duration_days: durationDays,
            starts_at: now.toISOString(),
            ends_at: endsAt,
            status: "active",
            plan_id: orderRow.plan_id,
            order_id: orderRow.id,
            queued_from_previous: false,
            activated_at: now.toISOString(),
            metadata: {
              activation_source: "admin_reconciliation_direct_fallback",
              razorpay_order_id: orderRow.razorpay_order_id ?? null,
              razorpay_payment_id: orderRow.razorpay_payment_id ?? null,
              reconciled_by: actorUserId,
            },
          })
          .select("id")
          .single<{ id: string }>();

        if (insertError) {
          return NextResponse.json({ success: false, message: "Activation failed", action_taken: "activation_failed", orderType, orderId, error: insertError.message, debug_stage: "subscription_insert_failed" }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: "Reconciliation completed. Subscription is now active.",
          action_taken: "created_missing_subscription",
          orderType,
          orderId,
          subscription_id: inserted.id,
        });
      }
    }

    if (!act.ok) {
      const activationDebugStage = act.debugStage ?? debugStage;
      return NextResponse.json({ success: false, message: "Activation failed", action_taken: "activation_failed", orderType, orderId, error: act.error, debug_stage: activationDebugStage }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: act.idempotent ? "Subscription already exists for this order." : "Featured upgrade reconciled. Bigger plan is now active.", action_taken: act.idempotent ? "already_exists" : "activated_subscription", orderType, orderId, subscription_id: act.subscriptionId ?? undefined, debug_stage: act.debugStage ?? "subscription_insert_success" });
  } catch (error) {
    const safeError = error instanceof Error ? error.message : String(error);
    console.error("[admin/featured-reconciliation/reconcile] failed", { debugStage, error: safeError });
    return NextResponse.json({ success: false, message: "Reconciliation failed", error: safeError, debug_stage: debugStage }, { status: 500 });
  }
}
