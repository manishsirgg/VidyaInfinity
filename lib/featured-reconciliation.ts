import type { SupabaseClient } from "@supabase/supabase-js";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { compareFeaturedPlans, getCurrentFeaturedState, type FeaturedType } from "@/lib/featured-state";

export type FeaturedOrderType = FeaturedType;

const CFG = {
  institute: { orderTable: "featured_listing_orders", subTable: "institute_featured_subscriptions", planTable: "featured_listing_plans", target: null },
  course: { orderTable: "course_featured_orders", subTable: "course_featured_subscriptions", planTable: "course_featured_plans", target: "course_id" },
  webinar: { orderTable: "webinar_featured_orders", subTable: "webinar_featured_subscriptions", planTable: "webinar_featured_plans", target: "webinar_id" },
} as const;

export async function activateFeaturedSubscriptionFromPaidOrder(params: { supabase: SupabaseClient; orderType: FeaturedOrderType; orderId: string; razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string; source: "verify" | "webhook" | "admin_reconciliation" | "manual_admin_grant"; actorUserId?: string; reason?: string; razorpayPayload?: Record<string, unknown>; }) {
  const nowIso = new Date().toISOString();
  const cfg = CFG[params.orderType];
  const { data: order } = await params.supabase.from(cfg.orderTable).select("id,institute_id,created_by,plan_id,duration_days,currency,amount,final_payable_amount,payment_status,order_status,paid_at,razorpay_order_id,razorpay_payment_id,metadata,course_id,webinar_id").eq("id", params.orderId).maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };

  const { data: existingForOrder } = await params.supabase.from(cfg.subTable).select("id,status").eq("order_id", params.orderId).limit(1).maybeSingle();
  if (existingForOrder) return { ok: true, idempotent: true, subscriptionId: existingForOrder.id };

  const targetId = params.orderType === "course" ? order.course_id : params.orderType === "webinar" ? order.webinar_id : undefined;
  const state = await getCurrentFeaturedState({ supabase: params.supabase, type: params.orderType, instituteId: order.institute_id, targetId });
  const selectedPlan = state.planById.get(String(order.plan_id));
  console.info("[featured/activate] plan_lookup", {
    orderType: params.orderType,
    orderId: params.orderId,
    planId: order.plan_id,
    planFound: Boolean(selectedPlan),
    planCode: selectedPlan?.plan_code ?? selectedPlan?.code ?? null,
    durationDays: order.duration_days ?? selectedPlan?.duration_days ?? null,
  });
  if (!selectedPlan) return { ok: false, error: "Plan not found for order" };

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
  if (orderUpdateError) return { ok: false, error: orderUpdateError.message };

  const activePlan = state.currentPlanId ? state.planById.get(String(state.currentPlanId)) ?? null : null;
  if (state.activeSubscription && activePlan) {
    const cmp = compareFeaturedPlans(activePlan, selectedPlan);
    if (cmp <= 0) {
      console.warn("[featured/activate] skipped_same_or_lower", { orderType: params.orderType, orderId: params.orderId, instituteId: order.institute_id });
      return { ok: true, skipped: true, message: "Same/lower plan payment verified; subscription unchanged" };
    }
    const metadata = (state.activeSubscription.metadata ?? {}) as Record<string, unknown>;
    const cancelPatch: Record<string, unknown> = {
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_reason: "upgraded",
      updated_at: nowIso,
      metadata: { ...metadata, superseded: true, superseded_by_order_id: params.orderId, superseded_at: nowIso },
    };
    const { error: cancelError } = await params.supabase.from(cfg.subTable).update(cancelPatch).eq("id", state.activeSubscription.id).eq("status", "active");
    if (cancelError) return { ok: false, error: cancelError.message };
  }

  const startsAt = nowIso;
  const durationDays = Number(order.duration_days ?? selectedPlan.duration_days ?? 0);
  const endsAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  const amountSource = params.orderType === "institute" ? "plan.price" : "order.final_payable_amount_or_amount";
  const subPayload: Record<string, unknown> = {
    institute_id: order.institute_id,
    order_id: order.id,
    plan_id: order.plan_id,
    plan_code: selectedPlan.plan_code ?? selectedPlan.code ?? null,
    amount: params.orderType === "institute" ? Number(selectedPlan.price ?? 0) : Number(order.final_payable_amount ?? order.amount ?? selectedPlan.price ?? 0),
    currency: order.currency ?? "INR",
    duration_days: durationDays,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "active",
    activated_at: nowIso,
    queued_from_previous: false,
    created_by: order.created_by ?? params.actorUserId ?? null,
    metadata: {
      activation_source: params.source,
      razorpay_order_id: params.razorpayOrderId ?? order.razorpay_order_id ?? null,
      razorpay_payment_id: params.razorpayPaymentId ?? order.razorpay_payment_id ?? null,
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
  const { data: inserted, error: subError } = await params.supabase.from(cfg.subTable).insert(subPayload).select("id").single();
  if (subError) {
    console.error("[featured/activate] insert_failed", { orderType: params.orderType, orderId: params.orderId, error: subError.message, details: subError.details, hint: subError.hint, code: subError.code });
    return { ok: false, error: subError.message };
  }

  await writeAdminAuditLog({ adminUserId: params.actorUserId ?? null, actorUserId: params.actorUserId ?? null, action: `featured_${params.orderType}_activate`, targetTable: cfg.orderTable, targetId: params.orderId, description: params.reason ?? `source:${params.source}`, metadata: { source: params.source, subId: inserted?.id ?? null } });
  return { ok: true, subscriptionId: inserted?.id ?? null };
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
