import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanRecord = Record<string, unknown>;
type OrderRecord = Record<string, unknown>;
type SubscriptionRecord = Record<string, unknown>;

type FeaturedSummary = {
  current: SubscriptionRecord | null;
  nextScheduled: SubscriptionRecord | null;
  hasActive: boolean;
  hasScheduled: boolean;
  nextPurchaseWillStack: boolean;
  upgradeAvailable: boolean;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parsePlans(rows: PlanRecord[]) {
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.plan_code ?? row.code ?? ""),
    name: String(row.name ?? row.label ?? row.plan_code ?? row.code ?? "Featured Plan"),
    description: typeof row.description === "string" ? row.description : null,
    durationDays: toNumber(row.duration_days),
    price: toNumber(row.price ?? row.amount),
    currency: typeof row.currency === "string" && row.currency ? row.currency : "INR",
    sortOrder: toNumber(row.sort_order),
    tierRank: toNumber(row.tier_rank),
    isActive: Boolean(row.is_active ?? true),
  }));
}

function buildSummary(subscriptions: SubscriptionRecord[], plans: ReturnType<typeof parsePlans>): FeaturedSummary {
  const now = Date.now();
  const normalized: Array<Record<string, unknown>> = subscriptions
    .map((subscription) => {
      const startsAt = toIsoDate(subscription.starts_at);
      const endsAt = toIsoDate(subscription.ends_at);
      return {
        ...subscription,
        starts_at: startsAt,
        ends_at: endsAt,
      };
    })
    .filter((subscription) => Boolean(subscription.starts_at) && Boolean(subscription.ends_at));

  const active = normalized
    .filter((subscription) => {
      const startsAt = new Date(String(subscription.starts_at)).getTime();
      const endsAt = new Date(String(subscription.ends_at)).getTime();
      return startsAt <= now && endsAt > now;
    })
    .sort((left, right) => new Date(String(right.ends_at)).getTime() - new Date(String(left.ends_at)).getTime())[0] ?? null;

  const scheduled = normalized
    .filter((subscription) => new Date(String(subscription.starts_at)).getTime() > now)
    .sort((left, right) => new Date(String(left.starts_at)).getTime() - new Date(String(right.starts_at)).getTime())[0] ?? null;

  const currentPlanId = typeof active?.plan_id === "string" ? active.plan_id : null;
  const currentPlan = plans.find((item) => item.id === currentPlanId);
  const upgradeAvailable = Boolean(currentPlan && plans.some((item) => item.tierRank > currentPlan.tierRank));

  return {
    current: active,
    nextScheduled: scheduled,
    hasActive: Boolean(active),
    hasScheduled: Boolean(scheduled),
    nextPurchaseWillStack: Boolean(active || scheduled),
    upgradeAvailable,
  };
}

export async function GET() {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  try {
    await admin.data.rpc("expire_featured_subscriptions");
  } catch {
    // Ignore expiry cleanup failures for read path.
  }

  const { data: institute } = await admin.data
    .from("institutes")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!institute) {
    return NextResponse.json({ plans: [], orders: [], subscriptions: [], summary: null });
  }

  const [{ data: plans }, { data: orders }, { data: subscriptions }] = await Promise.all([
    admin.data.from("featured_listing_plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.data.from("featured_listing_orders").select("*").eq("institute_id", institute.id).order("created_at", { ascending: false }),
    admin.data.from("institute_featured_subscriptions").select("*").eq("institute_id", institute.id).order("starts_at", { ascending: false }),
  ]);

  const parsedPlans = parsePlans((plans ?? []) as PlanRecord[]);
  const parsedSubscriptions = (subscriptions ?? []) as SubscriptionRecord[];

  return NextResponse.json({
    plans: parsedPlans,
    orders: (orders ?? []) as OrderRecord[],
    subscriptions: parsedSubscriptions,
    summary: buildSummary(parsedSubscriptions, parsedPlans),
  });
}
