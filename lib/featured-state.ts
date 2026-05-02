import type { SupabaseClient } from "@supabase/supabase-js";

export type FeaturedType = "institute" | "course" | "webinar";

type Plan = { id: string; plan_code: string | null; code: string | null; duration_days: number; amount: number | null; price?: number | null; tier_rank?: number | null };

type Subscription = { id: string; plan_id: string | null; status: string; starts_at: string; ends_at: string; activated_at: string | null; created_at: string; amount: number; duration_days: number; metadata?: Record<string, unknown> | null };

const rankMap: Record<string, number> = { weekly: 1, monthly: 2, quarterly: 3, half_yearly: 4, yearly: 5 };

function codeRank(code?: string | null) { return rankMap[String(code ?? "").toLowerCase()] ?? 0; }

export function compareFeaturedPlans(current: Plan | null | undefined, selected: Plan | null | undefined) {
  if (!current || !selected) return 0;
  const cr = Number(current.tier_rank ?? 0) || codeRank(current.plan_code ?? current.code);
  const sr = Number(selected.tier_rank ?? 0) || codeRank(selected.plan_code ?? selected.code);
  if (cr > 0 || sr > 0) return sr - cr;
  const cDur = Number(current.duration_days ?? 0);
  const sDur = Number(selected.duration_days ?? 0);
  if (cDur !== sDur) return sDur - cDur;
  const cAmt = Number(current.amount ?? current.price ?? 0);
  const sAmt = Number(selected.amount ?? selected.price ?? 0);
  return sAmt - cAmt;
}

export async function getCurrentFeaturedState(params: { supabase: SupabaseClient; type: FeaturedType; instituteId: string; targetId?: string }) {
  const nowMs = Date.now();
  const table = params.type === "institute" ? "featured_listing_subscriptions" : params.type === "course" ? "course_featured_subscriptions" : "webinar_featured_subscriptions";
  const planTable = params.type === "institute" ? "featured_listing_plans" : params.type === "course" ? "course_featured_plans" : "webinar_featured_plans";
  const targetKey = params.type === "institute" ? null : params.type === "course" ? "course_id" : "webinar_id";
  let q = params.supabase.from(table).select("id,plan_id,status,starts_at,ends_at,activated_at,created_at,amount,duration_days,metadata").eq("institute_id", params.instituteId);
  if (targetKey && params.targetId) q = q.eq(targetKey, params.targetId);
  const { data: rows } = await q;
  const subs = (rows ?? []) as Subscription[];
  const validActive = subs.filter((s) => s.status === "active" && new Date(s.starts_at).getTime() <= nowMs && new Date(s.ends_at).getTime() > nowMs)
    .sort((a,b)=> new Date(b.activated_at ?? b.created_at).getTime()-new Date(a.activated_at ?? a.created_at).getTime());
  const activeSubscription = validActive[0] ?? null;
  const duplicateActiveWarning = validActive.length > 1;
  const scheduledSubscription = subs.filter((s)=> s.status === "scheduled" || new Date(s.starts_at).getTime() > nowMs)
    .sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime())[0] ?? null;
  const { data: plans } = await params.supabase.from(planTable).select("id,plan_code,code,duration_days,amount,price,tier_rank").or("is_active.eq.true,is_active.is.null");
  const planRows = ((plans ?? []) as Plan[]).map((plan) => {
    if (params.type === "institute") {
      const canonicalAmount = Number(plan.price ?? plan.amount ?? 0);
      return { ...plan, amount: canonicalAmount, price: canonicalAmount };
    }
    return plan;
  });
  const planById = new Map(planRows.map((p)=>[String(p.id), p]));
  const currentPlan = activeSubscription?.plan_id ? planById.get(String(activeSubscription.plan_id)) ?? null : null;
  return { activeSubscription, scheduledSubscription, currentPlanId: currentPlan?.id ?? activeSubscription?.plan_id ?? null, currentPlanCode: currentPlan?.plan_code ?? currentPlan?.code ?? null, currentPlanDurationDays: currentPlan?.duration_days ?? activeSubscription?.duration_days ?? null, currentPlanAmount: currentPlan?.amount ?? activeSubscription?.amount ?? null, expiresAt: activeSubscription?.ends_at ?? null, duplicateActiveWarning, plans: planRows, planById };
}
