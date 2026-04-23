import type { SupabaseClient } from "@supabase/supabase-js";

export type FeaturedPlanRow = {
  id: string | number;
  plan_code: string | null;
  code: string | null;
  duration_days: number;
  amount: number | null;
  price: number | null;
  currency: string | null;
  is_active: boolean | null;
  tier_rank: number | null;
};

function normalizePlanToken(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim().toLowerCase();
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
}

function resolveByLegacyToken(plans: FeaturedPlanRow[], token: string) {
  const normalized = normalizePlanToken(token);
  if (!normalized) return null;

  return plans.find((plan) => {
    const tokens = [plan.id, plan.plan_code, plan.code];
    return tokens.some((item) => normalizePlanToken(item) === normalized);
  }) ?? null;
}

export async function resolveFeaturedPlan(params: {
  admin: SupabaseClient;
  table: "course_featured_plans" | "webinar_featured_plans";
  selectedPlanToken: string;
}) {
  const trimmedToken = params.selectedPlanToken.trim();
  if (!trimmedToken) {
    return { plan: null as FeaturedPlanRow | null, resolution: "empty_token" as const, availablePlanTokens: [] as string[] };
  }

  const { data: canonical } = await params.admin
    .from(params.table)
    .select("id,plan_code,code,duration_days,amount,price,currency,is_active,tier_rank")
    .eq("id", trimmedToken)
    .or("is_active.eq.true,is_active.is.null")
    .maybeSingle<FeaturedPlanRow>();

  if (canonical) return { plan: canonical, resolution: "canonical_id" as const, availablePlanTokens: [] as string[] };

  const { data: activeRows } = await params.admin
    .from(params.table)
    .select("id,plan_code,code,duration_days,amount,price,currency,is_active,tier_rank")
    .or("is_active.eq.true,is_active.is.null")
    .order("sort_order", { ascending: true });

  const planRows = (activeRows ?? []) as FeaturedPlanRow[];
  const fallback = resolveByLegacyToken(planRows, trimmedToken);
  const availablePlanTokens = planRows
    .map((candidate) => [candidate.id, candidate.plan_code, candidate.code].map((token) => normalizePlanToken(token)).filter(Boolean).join("|"))
    .filter(Boolean);

  if (fallback) return { plan: fallback, resolution: "legacy_token_fallback" as const, availablePlanTokens };

  return { plan: null as FeaturedPlanRow | null, resolution: "not_found" as const, availablePlanTokens };
}
