import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { compareFeaturedPlans } from "@/lib/featured-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [courseOrdersQ, webinarOrdersQ, courseSubsQ, webinarSubsQ, coursePlansQ, webinarPlansQ] = await Promise.all([
    admin.data.from("course_featured_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.data.from("webinar_featured_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.data.from("course_featured_subscriptions").select("id,order_id,course_id,status,plan_id,created_at,starts_at,ends_at"),
    admin.data.from("webinar_featured_subscriptions").select("id,order_id,webinar_id,status,plan_id,created_at,starts_at,ends_at"),
    admin.data.from("course_featured_plans").select("id,plan_code,code,duration_days,amount,price,tier_rank"),
    admin.data.from("webinar_featured_plans").select("id,plan_code,code,duration_days,amount,price,tier_rank"),
  ]);
  const now = Date.now();
  const courseOrders = courseOrdersQ.data ?? []; const webinarOrders = webinarOrdersQ.data ?? [];
  const courseSubs = courseSubsQ.data ?? []; const webinarSubs = webinarSubsQ.data ?? [];
  const coursePlanById = new Map((coursePlansQ.data ?? []).map((p)=>[String(p.id),p]));
  const webinarPlanById = new Map((webinarPlansQ.data ?? []).map((p)=>[String(p.id),p]));

  type PlanLike = { id: string; plan_code: string | null; code: string | null; duration_days: number; amount: number | null; price?: number | null; tier_rank?: number | null };
  type OrderLike = Record<string, unknown> & { id: string; plan_id: string | null; payment_status: string | null; order_status: string | null; created_at: string; course_id?: string; webinar_id?: string };
  type SubLike = { id: string; order_id: string | null; status: string; plan_id: string | null; starts_at: string; ends_at: string; course_id?: string; webinar_id?: string };
  const build = (type: "course"|"webinar", orders: OrderLike[], subs: SubLike[], planById: Map<string, PlanLike>, key: "course_id"|"webinar_id") => {
    const subByOrder = new Map(subs.filter(s=>s.order_id).map(s=>[s.order_id,s]));
    const issues: Array<Record<string, unknown>> = [];
    for (const o of orders) {
      const isPaidConfirmed = o.payment_status === "paid" && (o.order_status === "confirmed" || o.order_status === "paid");
      if (!isPaidConfirmed) continue;
      const s = subByOrder.get(o.id);
      if (!s) {
        issues.push({ orderType:type, orderId:o.id, targetId:o[key], issue:"paid_featured_order_missing_subscription", recommended_action:"Create missing active subscription" });
        continue;
      }
      const active = subs.find(x=>x[key]===o[key]&&x.status==="active"&&new Date(x.starts_at).getTime()<=now&&new Date(x.ends_at).getTime()>now);
      if (s.status === "scheduled" && active) {
        const activePlan = planById.get(String(active.plan_id));
        const scheduledPlan = planById.get(String(s.plan_id)) ?? planById.get(String(o.plan_id));
        const byDuration = Number(scheduledPlan?.duration_days ?? 0) > Number(activePlan?.duration_days ?? 0);
        const byRank = activePlan && scheduledPlan ? compareFeaturedPlans(activePlan, scheduledPlan) > 0 : false;
        const computedIssue = (byDuration || byRank) ? `${type}_upgrade_paid_but_scheduled` : null;
        console.log("[admin/featured-reconciliation] upgrade_candidate_row", {
          paid_order_id: o.id,
          paid_subscription_id: s.id,
          paid_plan_code: scheduledPlan?.plan_code ?? scheduledPlan?.code ?? null,
          paid_duration_days: scheduledPlan?.duration_days ?? null,
          active_subscription_id: active.id,
          active_plan_code: activePlan?.plan_code ?? activePlan?.code ?? null,
          active_duration_days: activePlan?.duration_days ?? null,
          computed_issue: computedIssue,
        });
        if (computedIssue) {
          issues.push({ orderType:type, orderId:o.id, targetId:o[key], subscriptionId: s.id, currentActiveSubscriptionId: active.id, paidPlanCode: scheduledPlan?.plan_code ?? scheduledPlan?.code ?? null, activePlanCode: activePlan?.plan_code ?? activePlan?.code ?? null, issue:computedIssue, recommended_action:"Activate upgraded plan and cancel old lower plan" });
        }
      }
    }
    const grouped = new Map<string, OrderLike[]>();
    for (const o of orders) {
      const s = subByOrder.get(o.id);
      if (o.payment_status==="paid"&&(o.order_status==="confirmed"||o.order_status==="paid")&&s?.status==="scheduled") {
        const k=String(o[key]); grouped.set(k,[...(grouped.get(k)??[]),o]);
      }
    }
    for (const [target, arr] of grouped) if (arr.length>1) {
      arr.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
      for (let i=1;i<arr.length;i++) issues.push({ orderType:type, orderId:arr[i].id, targetId:target, issue:"duplicate_paid_scheduled_upgrade", recommended_action:"Review duplicate: refund manually or extend after admin decision" });
    }
    const paidScheduledCourseUpgradeCandidates = grouped.size;
    const courseUpgradeIssuesReturned = issues.filter((x) => x.issue === `${type}_upgrade_paid_but_scheduled`).length;
    const duplicatePaidScheduledUpgradeIssuesReturned = issues.filter((x) => x.issue === "duplicate_paid_scheduled_upgrade").length;
    console.log("[admin/featured-reconciliation] upgrade_detection_counts", { type, paidScheduledCourseUpgradeCandidates, courseUpgradeIssuesReturned, duplicatePaidScheduledUpgradeIssuesReturned });
    return issues;
  };

  return NextResponse.json({ issues: [...build("course", courseOrders, courseSubs, coursePlanById, "course_id"), ...build("webinar", webinarOrders, webinarSubs, webinarPlanById, "webinar_id")] });
}
