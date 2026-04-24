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

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

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

function toFeaturedPlanRow(row: Record<string, unknown>): FeaturedPlanRow | null {
  const id = row.id;
  const normalizedId = typeof id === "number" || typeof id === "string" ? id : "";
  if (normalizedId === "") return null;

  return {
    id: normalizedId,
    plan_code: typeof row.plan_code === "string" ? row.plan_code : null,
    code: typeof row.code === "string" ? row.code : null,
    duration_days: toNumber(row.duration_days),
    amount: typeof row.amount === "number" || typeof row.amount === "string" ? Number(row.amount) : null,
    price: typeof row.price === "number" || typeof row.price === "string" ? Number(row.price) : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    is_active: typeof row.is_active === "boolean" ? row.is_active : null,
    tier_rank: typeof row.tier_rank === "number" || typeof row.tier_rank === "string" ? Number(row.tier_rank) : null,
  };
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

  const { data: canonical, error: canonicalError } = await params.admin
    .from(params.table)
    .select("*")
    .eq("id", trimmedToken)
    .maybeSingle<Record<string, unknown>>();

  if (!canonicalError) {
    const normalizedCanonical = canonical ? toFeaturedPlanRow(canonical) : null;
    if (normalizedCanonical && normalizedCanonical.is_active !== false) {
      return { plan: normalizedCanonical, resolution: "canonical_id" as const, availablePlanTokens: [] as string[] };
    }
  }

  const { data: activeRows } = await params.admin
    .from(params.table)
    .select("*")
    .or("is_active.eq.true,is_active.is.null")
    .order("sort_order", { ascending: true });

  const planRows = ((activeRows ?? []) as Array<Record<string, unknown>>)
    .map((row) => toFeaturedPlanRow(row))
    .filter((row): row is FeaturedPlanRow => Boolean(row));
  const fallback = resolveByLegacyToken(planRows, trimmedToken);
  const availablePlanTokens = planRows
    .map((candidate) => [candidate.id, candidate.plan_code, candidate.code].map((token) => normalizePlanToken(token)).filter(Boolean).join("|"))
    .filter(Boolean);

  if (fallback) return { plan: fallback, resolution: "legacy_token_fallback" as const, availablePlanTokens };

  return { plan: null as FeaturedPlanRow | null, resolution: "not_found" as const, availablePlanTokens };
}
