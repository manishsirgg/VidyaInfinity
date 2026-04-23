import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseFeaturedPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  amount: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  tierRank: number;
};

export type CourseFeaturedSubscription = {
  id: string;
  institute_id: string;
  course_id: string;
  order_id: string | null;
  plan_id: string | null;
  plan_code: string | null;
  amount: number;
  currency: string;
  duration_days: number;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  activated_at: string | null;
  created_at: string;
};

export type CourseFeaturedOrder = {
  id: string;
  institute_id: string;
  course_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  duration_days: number;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
};

export type CourseFeaturedWindow = {
  startsAt: string;
  endsAt: string;
  queuedFromPrevious: boolean;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toBoolean(value: unknown) {
  return value === true;
}

function pickString(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeIso(value: unknown, fallbackIso: string) {
  if (typeof value !== "string") return fallbackIso;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

export function parseCourseFeaturedPlans(rows: Array<Record<string, unknown>>): CourseFeaturedPlan[] {
  return rows
    .map((row) => ({
      id: pickString(row.id),
      code: pickString(row.plan_code ?? row.code),
      name: pickString(row.name ?? row.plan_code ?? row.code, "Course Featured Plan"),
      description: typeof row.description === "string" ? row.description : null,
      durationDays: toNumber(row.duration_days),
      amount: toNumber(row.price ?? row.amount),
      currency: pickString(row.currency, "INR"),
      isActive: row.is_active === null ? true : toBoolean(row.is_active),
      sortOrder: toNumber(row.sort_order),
      tierRank: toNumber(row.tier_rank),
    }))
    .filter((row) => row.id.length > 0 && row.durationDays > 0 && row.amount > 0);
}

export async function getInstituteIdForUser(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("institutes")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

export async function getNextCourseFeaturedWindow(admin: SupabaseClient, courseId: string, durationDays: number): Promise<CourseFeaturedWindow> {
  const nowIso = new Date().toISOString();

  const rpcArgsVariants: Array<Record<string, unknown>> = [
    { p_course_id: courseId, p_duration_days: durationDays },
    { course_id: courseId, duration_days: durationDays },
  ];

  for (const args of rpcArgsVariants) {
    const { data, error } = await admin.rpc("get_next_course_featured_window", args);
    if (error) continue;

    const row = Array.isArray(data)
      ? ((data[0] as Record<string, unknown> | undefined) ?? null)
      : ((data as Record<string, unknown> | null) ?? null);

    if (!row) continue;

    const startsAt = normalizeIso(row.starts_at ?? row.start_at ?? row.window_start_at ?? row.window_start, nowIso);
    const endsAt = normalizeIso(row.ends_at ?? row.end_at ?? row.window_end_at ?? row.window_end, nowIso);
    const queuedFromPrevious = startsAt > nowIso;
    return { startsAt, endsAt, queuedFromPrevious };
  }

  const { data: latest } = await admin
    .from("course_featured_subscriptions")
    .select("ends_at")
    .eq("course_id", courseId)
    .in("status", ["active", "scheduled"])
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ ends_at: string }>();

  const startsAt = latest?.ends_at ? normalizeIso(latest.ends_at, nowIso) : nowIso;
  const startMs = new Date(startsAt).getTime();
  const endsAt = new Date(startMs + Math.max(0, durationDays) * 24 * 60 * 60 * 1000).toISOString();

  return {
    startsAt,
    endsAt,
    queuedFromPrevious: startMs > new Date(nowIso).getTime(),
  };
}
