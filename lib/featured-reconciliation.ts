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
  const { data: order } = await params.supabase.from(cfg.orderTable).select("id,institute_id,plan_id,duration_days,currency,amount,payment_status,order_status,paid_at,razorpay_order_id,razorpay_payment_id,metadata,course_id,webinar_id").eq("id", params.orderId).maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };

  const { data: existingForOrder } = await params.supabase.from(cfg.subTable).select("id,status").eq("order_id", params.orderId).limit(1).maybeSingle();
  if (existingForOrder) return { ok: true, idempotent: true, subscriptionId: existingForOrder.id };

  const targetId = params.orderType === "course" ? order.course_id : params.orderType === "webinar" ? order.webinar_id : undefined;
  const state = await getCurrentFeaturedState({ supabase: params.supabase, type: params.orderType, instituteId: order.institute_id, targetId });
  const selectedPlan = state.planById.get(String(order.plan_id));
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
    await params.supabase.from(cfg.subTable).update(cancelPatch).eq("id", state.activeSubscription.id).eq("status", "active");
  }

  const startsAt = nowIso;
  const endsAt = new Date(Date.now() + Number(order.duration_days) * 86400000).toISOString();
  const subPayload: Record<string, unknown> = {
    institute_id: order.institute_id,
    order_id: order.id,
    plan_id: order.plan_id,
    plan_code: selectedPlan.plan_code ?? selectedPlan.code ?? null,
    amount: order.amount,
    currency: order.currency,
    duration_days: order.duration_days,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "active",
    activated_at: nowIso,
    queued_from_previous: false,
    created_by: params.actorUserId ?? null,
  };
  if (cfg.target && targetId) subPayload[cfg.target] = targetId;
  const { data: inserted, error: subError } = await params.supabase.from(cfg.subTable).insert(subPayload).select("id").single();
  if (subError) return { ok: false, error: subError.message };

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
