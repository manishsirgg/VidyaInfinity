import type { SupabaseClient } from "@supabase/supabase-js";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { finalizeCoursePaymentFromRazorpay, finalizeWebinarPaymentFromRazorpay } from "@/lib/payments/finalize";

export type FeaturedOrderType = "institute" | "course" | "webinar";

export async function activateFeaturedSubscriptionFromPaidOrder(params: {
  supabase: SupabaseClient;
  orderType: FeaturedOrderType;
  orderId: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  source: "verify" | "webhook" | "admin_reconciliation" | "manual_admin_grant";
  actorUserId?: string;
  reason?: string;
  razorpayPayload?: Record<string, unknown>;
}) {
  const nowIso = new Date().toISOString();
  if (params.orderType === "course") {
    const { data: order } = await params.supabase.from("course_featured_orders").select("id,razorpay_order_id,payment_status,order_status,razorpay_payment_id").eq("id", params.orderId).maybeSingle();
    if (!order) return { ok: false, error: "Order not found" };
    if (order.payment_status === "paid") {
      const { data: existingSub } = await params.supabase.from("course_featured_subscriptions").select("id,status").eq("order_id", params.orderId).in("status", ["active", "scheduled"]).limit(1).maybeSingle();
      if (existingSub) return { ok: true, idempotent: true };
    }
    if (params.source !== "manual_admin_grant") {
      const res = await finalizeCoursePaymentFromRazorpay({ supabase: params.supabase, razorpayOrderId: params.razorpayOrderId ?? order.razorpay_order_id, razorpayPaymentId: params.razorpayPaymentId ?? order.razorpay_payment_id, razorpaySignature: params.razorpaySignature, razorpayStatus: "captured", source: params.source === "webhook" ? "webhook" : "verify_api" });
      if (res.error) return { ok: false, error: res.error };
    }
    await writeAdminAuditLog({ adminUserId: params.actorUserId ?? null, actorUserId: params.actorUserId ?? null, action: `featured_${params.orderType}_activate`, targetTable: "course_featured_orders", targetId: params.orderId, description: params.reason ?? `source:${params.source}`, metadata: { source: params.source, razorpayOrderId: params.razorpayOrderId ?? order.razorpay_order_id, razorpayPaymentId: params.razorpayPaymentId ?? order.razorpay_payment_id, razorpayPayload: params.razorpayPayload ?? null, at: nowIso } });
    return { ok: true };
  }
  if (params.orderType === "webinar") {
    const { data: order } = await params.supabase.from("webinar_featured_orders").select("id,razorpay_order_id,payment_status,order_status,razorpay_payment_id").eq("id", params.orderId).maybeSingle();
    if (!order) return { ok: false, error: "Order not found" };
    if (params.source !== "manual_admin_grant") {
      const res = await finalizeWebinarPaymentFromRazorpay({ supabase: params.supabase, razorpayOrderId: params.razorpayOrderId ?? order.razorpay_order_id, razorpayPaymentId: params.razorpayPaymentId ?? order.razorpay_payment_id, razorpaySignature: params.razorpaySignature, razorpayStatus: "captured", source: params.source === "webhook" ? "webhook" : "verify_api" });
      if (res.error) return { ok: false, error: res.error };
    }
    await writeAdminAuditLog({ adminUserId: params.actorUserId ?? null, actorUserId: params.actorUserId ?? null, action: `featured_${params.orderType}_activate`, targetTable: "webinar_featured_orders", targetId: params.orderId, description: params.reason ?? `source:${params.source}`, metadata: { source: params.source } });
    return { ok: true };
  }
  const { error } = await params.supabase.from("featured_listing_orders").update({ payment_status: params.source === "manual_admin_grant" ? "pending" : "paid", order_status: params.source === "manual_admin_grant" ? "manual_granted" : "confirmed", paid_at: params.source === "manual_admin_grant" ? null : nowIso, razorpay_payment_id: params.razorpayPaymentId ?? null, razorpay_signature: params.razorpaySignature ?? null, updated_at: nowIso }).eq("id", params.orderId);
  if (error) return { ok: false, error: error.message };
  await writeAdminAuditLog({ adminUserId: params.actorUserId ?? null, actorUserId: params.actorUserId ?? null, action: `featured_${params.orderType}_activate`, targetTable: "featured_listing_orders", targetId: params.orderId, description: params.reason ?? `source:${params.source}`, metadata: { source: params.source } });
  return { ok: true };
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
