import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { compareFeaturedPlans } from "@/lib/featured-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type FeatureType = "institute" | "course" | "webinar";
type AuditStatus =
  | "healthy_paid_linked"
  | "paid_missing_subscription"
  | "duplicate_subscription_same_order_id"
  | "paid_upgrade_scheduled_while_lower_active"
  | "duplicate_paid_scheduled_upgrade"
  | "pending_over_10m"
  | "failed_or_cancelled"
  | "review";

type AuditRow = Record<string, unknown> & {
  id: string;
  featureType: FeatureType;
  orderType: FeatureType;
  orderId: string;
  instituteId: string | null;
  targetId: string | null;
  targetType: "institute" | "course" | "webinar";
  planId: string | null;
  planCode: string | null;
  amount: number | null;
  paymentStatus: string | null;
  orderStatus: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionAmount: number | null;
  durationDays: number | null;
  startsAt: string | null;
  endsAt: string | null;
  activatedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  auditStatus: AuditStatus;
};

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [iO, cO, wO, iS, cS, wS, iP, cP, wP] = await Promise.all([
    admin.data.from("featured_listing_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.data.from("course_featured_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.data.from("webinar_featured_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.data.from("institute_featured_subscriptions").select("*"),
    admin.data.from("course_featured_subscriptions").select("*"),
    admin.data.from("webinar_featured_subscriptions").select("*"),
    admin.data.from("featured_listing_plans").select("*"),
    admin.data.from("course_featured_plans").select("*"),
    admin.data.from("webinar_featured_plans").select("*"),
  ]);

  const now = Date.now();
  const planMap = {
    institute: new Map((iP.data ?? []).map((p) => [String(p.id), p])),
    course: new Map((cP.data ?? []).map((p) => [String(p.id), p])),
    webinar: new Map((wP.data ?? []).map((p) => [String(p.id), p])),
  };

  const scanned = { institute: 0, course: 0, webinar: 0 };
  const skipped: Array<Record<string, unknown>> = [];
  const auditRows: AuditRow[] = [];

  type LooseRow = Record<string, unknown> & { id?: string; order_id?: string; plan_id?: string; institute_id?: string; course_id?: string; webinar_id?: string; payment_status?: string; order_status?: string; created_at?: string; paid_at?: string; razorpay_order_id?: string; razorpay_payment_id?: string; amount?: number | string | null; status?: string; starts_at?: string; ends_at?: string; activated_at?: string; cancelled_at?: string; cancelled_reason?: string; plan_code?: string; };

  function pushRows(type: FeatureType, orders: LooseRow[], subs: LooseRow[], targetKey: "institute_id" | "course_id" | "webinar_id") {
    scanned[type] = orders.length;
    const subByOrderList = new Map<string, LooseRow[]>();
    for (const sub of subs.filter((s) => s.order_id)) {
      const key = String(sub.order_id);
      subByOrderList.set(key, [...(subByOrderList.get(key) ?? []), sub]);
    }
    for (const o of orders) {
      if (!o?.id) { skipped.push({ type, reason: "missing_order_id" }); continue; }
      const orderId = String(o.id);
      const byOrder = subByOrderList.get(orderId) ?? [];
      const sub = byOrder[0];
      const plan = planMap[type].get(String(sub?.plan_id ?? o.plan_id ?? ""));
      const paymentStatus = o.payment_status ? String(o.payment_status) : null;
      const orderStatus = o.order_status ? String(o.order_status) : null;
      const isPaidConfirmed = paymentStatus === "paid" && (orderStatus === "confirmed" || orderStatus === "paid");
      const isFailed = ["failed", "cancelled"].includes(String(paymentStatus ?? "")) || ["failed", "cancelled"].includes(String(orderStatus ?? ""));
      const createdAtMs = o.created_at ? new Date(String(o.created_at)).getTime() : now;
      const isPending10m = paymentStatus === "pending" && createdAtMs < now - 10 * 60_000;
      let auditStatus: AuditStatus = "review";
      if (isFailed) auditStatus = "failed_or_cancelled";
      else if (isPending10m) auditStatus = "pending_over_10m";
      else if (isPaidConfirmed && byOrder.length === 0) auditStatus = "paid_missing_subscription";
      else if (isPaidConfirmed && byOrder.length > 1) auditStatus = "duplicate_subscription_same_order_id";
      else if (isPaidConfirmed && sub) auditStatus = "healthy_paid_linked";

      auditRows.push({
        id: `${type}:${orderId}:${sub?.id ?? "none"}`,
        featureType: type,
        orderType: type,
        orderId,
        instituteId: o.institute_id ? String(o.institute_id) : null,
        targetId: targetKey === "institute_id" ? (o.institute_id ? String(o.institute_id) : null) : (o[targetKey] ? String(o[targetKey]) : null),
        targetType: targetKey === "institute_id" ? "institute" : targetKey === "course_id" ? "course" : "webinar",
        planId: o.plan_id ? String(o.plan_id) : null,
        planCode: plan?.plan_code ?? sub?.plan_code ?? null,
        amount: Number(o.amount ?? plan?.price ?? 0),
        paymentStatus,
        orderStatus,
        razorpayOrderId: o.razorpay_order_id ?? null,
        razorpayPaymentId: o.razorpay_payment_id ?? null,
        paidAt: o.paid_at ?? null,
        createdAt: o.created_at ?? null,
        subscriptionId: sub?.id ?? null,
        subscriptionStatus: sub?.status ?? null,
        subscriptionAmount: sub?.amount != null ? Number(sub.amount) : null,
        durationDays: plan?.duration_days ?? null,
        startsAt: sub?.starts_at ?? null,
        endsAt: sub?.ends_at ?? null,
        activatedAt: sub?.activated_at ?? null,
        cancelledAt: sub?.cancelled_at ?? null,
        cancelledReason: sub?.cancelled_reason ?? null,
        auditStatus,
      });
    }

    const upgrades = auditRows.filter((r) => r.featureType === type && r.subscriptionStatus === "scheduled" && r.paymentStatus === "paid" && (r.orderStatus === "paid" || r.orderStatus === "confirmed") && r.targetId);
    const grouped = new Map<string, AuditRow[]>();
    for (const row of upgrades) grouped.set(String(row.targetId), [...(grouped.get(String(row.targetId)) ?? []), row]);
    for (const [target, rows] of grouped) {
      const active = subs.find((s) => {
        const starts = s.starts_at ? new Date(String(s.starts_at)).getTime() : 0;
        const ends = s.ends_at ? new Date(String(s.ends_at)).getTime() : 0;
        return String(s[targetKey]) === target && s.status === "active" && starts <= now && ends > now;
      });
      if (!active) continue;
      rows.sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
      rows.forEach((r, i) => {
        const activePlan = planMap[type].get(String(active.plan_id));
        const rowPlan = planMap[type].get(String(r.planId));
        const isUpgrade = (rowPlan?.duration_days ?? 0) > (activePlan?.duration_days ?? 0) || (activePlan && rowPlan ? compareFeaturedPlans(activePlan, rowPlan) > 0 : false);
        if (!isUpgrade) return;
        r.auditStatus = i === 0 ? "paid_upgrade_scheduled_while_lower_active" : "duplicate_paid_scheduled_upgrade";
      });
    }
  }

  pushRows("institute", iO.data ?? [], iS.data ?? [], "institute_id");
  pushRows("course", cO.data ?? [], cS.data ?? [], "course_id");
  pushRows("webinar", wO.data ?? [], wS.data ?? [], "webinar_id");

  const issues = auditRows
    .filter((r) => ["paid_missing_subscription", "paid_upgrade_scheduled_while_lower_active", "duplicate_paid_scheduled_upgrade", "duplicate_subscription_same_order_id"].includes(r.auditStatus))
    .map((r) => {
      const issue = r.auditStatus === "paid_upgrade_scheduled_while_lower_active" ? `${r.featureType}_upgrade_paid_but_scheduled` : r.auditStatus;
      return {
        ...r,
        id: `${issue}:${r.orderId}:${r.subscriptionId ?? "none"}`,
        issue,
        canReconcile: issue === "paid_missing_subscription" || issue === "course_upgrade_paid_but_scheduled" || issue === "webinar_upgrade_paid_but_scheduled" || issue === "paid_upgrade_scheduled_while_lower_active",
        recommendedAction: issue === "paid_missing_subscription" ? "Create missing active subscription" : issue === "duplicate_subscription_same_order_id" ? "Cancel duplicate subscription row manually; keep one subscription per paid order." : issue === "duplicate_paid_scheduled_upgrade" ? "Review duplicate: refund manually or extend after admin decision" : "Activate upgraded plan and cancel old lower plan",
      };
    });

  console.log("[admin/featured-reconciliation] scan_summary", { totalInstituteOrdersScanned: scanned.institute, totalCourseOrdersScanned: scanned.course, totalWebinarOrdersScanned: scanned.webinar, totalIssuesReturned: issues.length, totalAuditRowsReturned: auditRows.length, skippedRows: skipped });

  return NextResponse.json({ issues, auditRows });
}
