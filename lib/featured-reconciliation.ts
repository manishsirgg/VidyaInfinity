import type { SupabaseClient } from "@supabase/supabase-js";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { compareFeaturedPlans, getCurrentFeaturedState, type FeaturedType } from "@/lib/featured-state";

export type FeaturedOrderType = FeaturedType;

const orderTableByType = {
  institute: "featured_listing_orders",
  course: "course_featured_orders",
  webinar: "webinar_featured_orders",
} as const;

const CFG = {
  institute: { orderTable: "featured_listing_orders", subTable: "institute_featured_subscriptions", planTable: "featured_listing_plans", target: null },
  course: { orderTable: "course_featured_orders", subTable: "course_featured_subscriptions", planTable: "course_featured_plans", target: "course_id" },
  webinar: { orderTable: "webinar_featured_orders", subTable: "webinar_featured_subscriptions", planTable: "webinar_featured_plans", target: "webinar_id" },
} as const;

// IMPORTANT regression guard:
// Keep order selects type-specific so institute queries never reference course_id/webinar_id.
const ORDER_SELECT_BY_TYPE = {
  institute: "id,institute_id,created_by,plan_id,amount,base_amount,final_payable_amount,currency,duration_days,payment_status,order_status,razorpay_order_id,razorpay_payment_id,paid_at,metadata",
  course: "id,institute_id,created_by,course_id,plan_id,amount,currency,duration_days,payment_status,order_status,razorpay_order_id,razorpay_payment_id,paid_at,metadata",
  webinar: "id,institute_id,created_by,webinar_id,plan_id,amount,currency,duration_days,payment_status,order_status,razorpay_order_id,razorpay_payment_id,paid_at,metadata",
} as const;

// IMPORTANT regression guard:
// Keep plan selects type-specific. Do not assume a shared schema across
// featured_listing_plans, course_featured_plans, and webinar_featured_plans.
// - featured_listing_plans uses plan_code and price (not code/amount).
// - course_featured_plans does not have code in production; do not select it.
// - webinar_featured_plans may differ from institute schema; keep selects explicit.
const ORDER_PLAN_SELECT_BY_TYPE = {
  institute: "id,name,slug,plan_code,duration_days,price,currency,metadata",
  course: "id,name,slug,plan_code,duration_days,price,currency,metadata",
  webinar: "id,name,slug,plan_code,duration_days,price,currency,metadata",
} as const;

type FeaturedOrderRow = {
  id: string;
  institute_id: string | null;
  created_by: string | null;
  plan_id: string | null;
  amount: number | null;
  base_amount?: number | null;
  final_payable_amount?: number | null;
  currency: string | null;
  duration_days: number | null;
  payment_status: string | null;
  order_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
  course_id?: string | null;
  webinar_id?: string | null;
};

export async function activateFeaturedSubscriptionFromPaidOrder(params: { supabase: SupabaseClient; orderType: FeaturedOrderType; orderId: string; razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string; source: "verify" | "webhook" | "admin_reconciliation" | "manual_admin_grant"; actorUserId?: string; reason?: string; razorpayPayload?: Record<string, unknown>; }) {
  const nowIso = new Date().toISOString();
  const cfg = CFG[params.orderType];
  const orderTable = orderTableByType[params.orderType];
  const orderQuery =
    params.orderType === "institute"
      ? params.supabase.from("featured_listing_orders").select(ORDER_SELECT_BY_TYPE.institute).eq("id", params.orderId).maybeSingle()
      : params.orderType === "course"
        ? params.supabase.from("course_featured_orders").select(ORDER_SELECT_BY_TYPE.course).eq("id", params.orderId).maybeSingle()
        : params.supabase.from("webinar_featured_orders").select(ORDER_SELECT_BY_TYPE.webinar).eq("id", params.orderId).maybeSingle();
  const { data: order, error: orderLookupError } = (await orderQuery) as { data: FeaturedOrderRow | null; error: { message: string } | null };
  if (orderLookupError) return { ok: false, error: orderLookupError.message, debugStage: "order_loaded" };
  if (!order) {
    const missingMessage = params.orderType === "institute"
      ? `Order not found in featured_listing_orders by id=${params.orderId}`
      : `Order not found in ${orderTable} by id=${params.orderId}`;
    return { ok: false, error: missingMessage, debugStage: "order_loaded" };
  }

  const { data: existingForOrder } = await params.supabase.from(cfg.subTable).select("id,status,starts_at,ends_at,plan_code,duration_days,metadata").eq("order_id", params.orderId).limit(1).maybeSingle();

  if (!order.institute_id) return { ok: false, error: "Missing required field: order.institute_id", debugStage: "plan_loaded" };
  const targetId = params.orderType === "course" ? (order.course_id ?? undefined) : params.orderType === "webinar" ? (order.webinar_id ?? undefined) : undefined;
  const state = await getCurrentFeaturedState({ supabase: params.supabase, type: params.orderType, instituteId: order.institute_id, targetId });
  const { data: selectedPlan, error: planLookupError } = await params.supabase
    .from(cfg.planTable)
    .select(ORDER_PLAN_SELECT_BY_TYPE[params.orderType])
    .eq("id", String(order.plan_id))
    .maybeSingle<{ id: string; plan_code?: string | null; slug?: string | null; price?: number | null; currency?: string | null; duration_days?: number | null }>();
  if (planLookupError) return { ok: false, error: planLookupError.message, debugStage: "plan_loaded" };
  console.info("[featured/activate] plan_lookup", {
    orderType: params.orderType,
    orderId: params.orderId,
    planId: order.plan_id,
    planFound: Boolean(selectedPlan),
    planCode: selectedPlan?.plan_code ?? selectedPlan?.slug ?? null,
    durationDays: order.duration_days ?? selectedPlan?.duration_days ?? null,
  });
  if (!selectedPlan) return { ok: false, error: "Plan not found for order", debugStage: "plan_loaded" };
  const normalizedPlanCode = selectedPlan.plan_code ?? selectedPlan.slug ?? null;
  const normalizedAmount = order.final_payable_amount ?? order.amount ?? selectedPlan.price ?? null;
  const normalizedDurationDays = order.duration_days ?? selectedPlan.duration_days ?? null;
  if (!order.created_by) return { ok: false, error: "Missing required field: order.created_by", debugStage: "plan_loaded" };
  if (!order.plan_id) return { ok: false, error: "Missing required field: order.plan_id", debugStage: "plan_loaded" };
  if (!normalizedPlanCode) return { ok: false, error: "Missing required field: plan.plan_code", debugStage: "plan_loaded" };
  if (normalizedAmount == null) return { ok: false, error: "Missing required field: amount", debugStage: "plan_loaded" };

  const paidPatch: Record<string, unknown> = {
    payment_status: params.source === "manual_admin_grant" ? "pending" : "paid",
    order_status: params.source === "manual_admin_grant" ? "pending" : "confirmed",
    paid_at: params.source === "manual_admin_grant" ? order.paid_at : (order.paid_at ?? nowIso),
    razorpay_payment_id: params.razorpayPaymentId ?? order.razorpay_payment_id ?? null,
    razorpay_signature: params.razorpaySignature ?? null,
    updated_at: nowIso,
    metadata: { ...(order.metadata ?? {}), payment_method: "razorpay", activation_source: params.source },
  };
  const { error: orderUpdateError } = await params.supabase.from(cfg.orderTable).update(paidPatch).eq("id", params.orderId).neq("order_status", "cancelled");
  if (orderUpdateError) return { ok: false, error: orderUpdateError.message, debugStage: "activation_helper_called" };

  let activeExistingQuery = params.supabase.from(cfg.subTable).select("id,status,starts_at,ends_at,metadata").eq("status", "active").lte("starts_at", nowIso).gt("ends_at", nowIso);
  if (params.orderType === "institute") activeExistingQuery = activeExistingQuery.eq("institute_id", order.institute_id);
  if (params.orderType === "course" && targetId) activeExistingQuery = activeExistingQuery.eq("course_id", targetId);
  if (params.orderType === "webinar" && targetId) activeExistingQuery = activeExistingQuery.eq("webinar_id", targetId);
  const { data: activeExisting } = await activeExistingQuery.order("starts_at", { ascending: false }).limit(1).maybeSingle();
  const selectedPlanForCompare = state.planById.get(String(order.plan_id));
  const activePlan = state.currentPlanId ? state.planById.get(String(state.currentPlanId)) ?? null : null;
  const purchaseIntent = String((order.metadata ?? {}).purchase_intent ?? "");
  const isUpgrade = purchaseIntent === "upgrade" || (activeExisting && activePlan && selectedPlanForCompare ? compareFeaturedPlans(activePlan, selectedPlanForCompare) > 0 : false);
  const isRenewal = purchaseIntent === "renewal" || (!isUpgrade && Boolean(activeExisting));

  let actionTaken = "none";
  if (existingForOrder?.status === "active") {
    actionTaken = "already_active_for_order";
    console.info("[featured/activate] existing_subscription_case", { orderType: params.orderType, orderId: params.orderId, existingSubscriptionId: existingForOrder.id, existingSubscriptionStatus: existingForOrder.status, currentActiveSubscriptionId: activeExisting?.id ?? null, currentActivePlanCode: activePlan?.plan_code ?? null, currentActiveDurationDays: activePlan?.duration_days ?? null, existingPlanCode: existingForOrder.plan_code ?? normalizedPlanCode, existingDurationDays: existingForOrder.duration_days ?? normalizedDurationDays, computedIntent: isUpgrade ? "upgrade" : (isRenewal ? "renewal" : "new"), actionTaken });
    return { ok: true, idempotent: true, subscriptionId: existingForOrder.id, activationStatus: "active", message: "Subscription already active for this order.", actionTaken };
  }

  if (existingForOrder?.status === "scheduled") {
    const computedIntent = isUpgrade ? "upgrade" : (isRenewal ? "renewal" : "new");
    if (!isUpgrade) {
      actionTaken = "renewal_already_scheduled";
      console.info("[featured/activate] existing_subscription_case", { orderType: params.orderType, orderId: params.orderId, existingSubscriptionId: existingForOrder.id, existingSubscriptionStatus: existingForOrder.status, currentActiveSubscriptionId: activeExisting?.id ?? null, currentActivePlanCode: activePlan?.plan_code ?? null, currentActiveDurationDays: activePlan?.duration_days ?? null, existingPlanCode: existingForOrder.plan_code ?? normalizedPlanCode, existingDurationDays: existingForOrder.duration_days ?? normalizedDurationDays, computedIntent, actionTaken });
      return { ok: true, idempotent: true, subscriptionId: existingForOrder.id, activationStatus: "scheduled", message: "Renewal already scheduled for this order.", actionTaken };
    }

    if (activeExisting) {
      const metadata = (activeExisting.metadata ?? {}) as Record<string, unknown>;
      const cancelPatch: Record<string, unknown> = {
        status: "cancelled",
        cancelled_at: nowIso,
        cancelled_reason: "upgraded",
        updated_at: nowIso,
        metadata: { ...metadata, superseded: true, superseded_by_order_id: params.orderId, superseded_at: nowIso },
      };
      const { error: cancelError } = await params.supabase.from(cfg.subTable).update(cancelPatch).eq("id", activeExisting.id).eq("status", "active");
      if (cancelError) return { ok: false, error: cancelError.message, debugStage: "activation_helper_called" };
    }

    const durationDaysUpgrade = Number(order.duration_days ?? normalizedDurationDays ?? existingForOrder.duration_days ?? 0);
    if (!durationDaysUpgrade || durationDaysUpgrade <= 0) return { ok: false, error: "Missing required field: duration_days", debugStage: "plan_loaded" };
    const endsAtUpgrade = new Date(new Date(nowIso).getTime() + durationDaysUpgrade * 86400000).toISOString();
    const existingMetadata = (existingForOrder.metadata ?? {}) as Record<string, unknown>;
    const { data: upgradedSub, error: upgradeError } = await params.supabase.from(cfg.subTable).update({
      status: "active",
      starts_at: nowIso,
      activated_at: nowIso,
      ends_at: endsAtUpgrade,
      queued_from_previous: false,
      updated_at: nowIso,
      metadata: { ...existingMetadata, activation_corrected_from_scheduled: true, activation_source: params.source, previous_subscription_id: activeExisting?.id ?? null },
    }).eq("id", existingForOrder.id).eq("status", "scheduled").select("*").single();
    if (upgradeError) return { ok: false, error: upgradeError.message, debugStage: "activation_helper_called" };
    actionTaken = "upgraded_subscription_activated";
    console.info("[featured/activate] existing_subscription_case", { orderType: params.orderType, orderId: params.orderId, existingSubscriptionId: existingForOrder.id, existingSubscriptionStatus: existingForOrder.status, currentActiveSubscriptionId: activeExisting?.id ?? null, currentActivePlanCode: activePlan?.plan_code ?? null, currentActiveDurationDays: activePlan?.duration_days ?? null, existingPlanCode: existingForOrder.plan_code ?? normalizedPlanCode, existingDurationDays: existingForOrder.duration_days ?? normalizedDurationDays, computedIntent, actionTaken });
    return { ok: true, subscriptionId: upgradedSub?.id ?? existingForOrder.id, subscription: upgradedSub ?? null, debugStage: "subscription_insert_success", message: "Featured upgrade reconciled. Bigger plan is now active.", actionTaken };
  }

  if (existingForOrder?.status && ["cancelled", "expired"].includes(existingForOrder.status)) {
    actionTaken = "manual_review_required_existing_inactive";
    console.info("[featured/activate] existing_subscription_case", { orderType: params.orderType, orderId: params.orderId, existingSubscriptionId: existingForOrder.id, existingSubscriptionStatus: existingForOrder.status, currentActiveSubscriptionId: activeExisting?.id ?? null, currentActivePlanCode: activePlan?.plan_code ?? null, currentActiveDurationDays: activePlan?.duration_days ?? null, existingPlanCode: existingForOrder.plan_code ?? normalizedPlanCode, existingDurationDays: existingForOrder.duration_days ?? normalizedDurationDays, computedIntent: isUpgrade ? "upgrade" : (isRenewal ? "renewal" : "new"), actionTaken });
    return { ok: false, error: `Existing subscription ${existingForOrder.id} is ${existingForOrder.status}; manual review required`, debugStage: "activation_helper_called", actionTaken };
  }

  if (activeExisting && isUpgrade) {
    const metadata = (activeExisting.metadata ?? {}) as Record<string, unknown>;
    const cancelPatch: Record<string, unknown> = {
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_reason: "upgraded",
      updated_at: nowIso,
      metadata: { ...metadata, superseded: true, superseded_by_order_id: params.orderId, superseded_at: nowIso },
    };
    const { error: cancelError } = await params.supabase.from(cfg.subTable).update(cancelPatch).eq("id", activeExisting.id).eq("status", "active");
    if (cancelError) return { ok: false, error: cancelError.message, debugStage: "activation_helper_called" };
  }

  const startsAt = isRenewal && activeExisting ? activeExisting.ends_at : nowIso;
  const durationDays = Number(order.duration_days ?? normalizedDurationDays ?? 0);
  if (!durationDays || durationDays <= 0) return { ok: false, error: "Missing required field: duration_days", debugStage: "plan_loaded" };
  const endsAt = new Date(new Date(startsAt).getTime() + durationDays * 86400000).toISOString();
  const amountSource = "order.final_payable_amount_or_amount_or_plan_amount_or_plan_price";
  const subPayload: Record<string, unknown> = {
    institute_id: order.institute_id,
    order_id: order.id,
    plan_id: order.plan_id,
    plan_code: normalizedPlanCode,
    amount: Number(normalizedAmount ?? 0),
    currency: order.currency ?? selectedPlan.currency ?? "INR",
    duration_days: durationDays,
    starts_at: startsAt,
    ends_at: endsAt,
    status: isRenewal ? "scheduled" : "active",
    activated_at: isRenewal ? null : nowIso,
    queued_from_previous: isRenewal,
    created_by: order.created_by ?? params.actorUserId ?? null,
      metadata: {
      activation_source: params.source,
      razorpay_order_id: params.razorpayOrderId ?? order.razorpay_order_id ?? null,
      razorpay_payment_id: params.razorpayPaymentId ?? order.razorpay_payment_id ?? null,
      reconciled_by: params.actorUserId ?? null,
    },
  };
  if (cfg.target && targetId) subPayload[cfg.target] = targetId;
  console.info("[featured/activate] inserting_subscription", {
    orderType: params.orderType,
    orderId: params.orderId,
    planId: order.plan_id,
    amountSource,
    payloadKeys: Object.keys(subPayload),
  });
  const write = existingForOrder
    ? await params.supabase.from(cfg.subTable).update({
      ...subPayload,
      metadata: { ...((existingForOrder.metadata as Record<string, unknown> | null) ?? {}), ...(subPayload.metadata as Record<string, unknown>), activation_corrected_from_scheduled: existingForOrder.status === "scheduled" && isUpgrade },
    }).eq("id", existingForOrder.id).select("*").single()
    : await params.supabase.from(cfg.subTable).insert(subPayload).select("*").single();
  const { data: inserted, error: subError } = write;
  if (subError) {
    console.error("[featured/activate] insert_failed", { orderType: params.orderType, orderId: params.orderId, error: subError.message, details: subError.details, hint: subError.hint, code: subError.code });
    return { ok: false, error: `${subError.message}${subError.details ? ` | details: ${subError.details}` : ""}${subError.hint ? ` | hint: ${subError.hint}` : ""}`, debugStage: "subscription_insert_failed" };
  }

  await writeAdminAuditLog({ adminUserId: params.actorUserId ?? null, actorUserId: params.actorUserId ?? null, action: `featured_${params.orderType}_activate`, targetTable: cfg.orderTable, targetId: params.orderId, description: params.reason ?? `source:${params.source}`, metadata: { source: params.source, subId: inserted?.id ?? null } });
  return { ok: true, subscriptionId: inserted?.id ?? null, subscription: inserted, debugStage: "subscription_insert_success" };
}

export async function fetchRazorpayPaymentForOrder(razorpayOrderId: string) {
  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return { ok: false, error: razorpay.error } as const;
  try {
    const paymentList = (await razorpay.data.orders.fetchPayments(razorpayOrderId)) as { items?: Array<{ id?: string; status?: string }> };
    const captured = (paymentList.items ?? []).find((x) => String(x.status ?? "").toLowerCase() === "captured" && x.id);
    if (!captured?.id) return { ok: true, paymentId: null } as const;
    return { ok: true, paymentId: captured.id } as const;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) } as const;
  }
}
