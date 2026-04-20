import type { SupabaseClient } from "@supabase/supabase-js";

export type WebinarFeaturedPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  amount: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
};

export type WebinarFeaturedWindow = {
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

export function parseWebinarFeaturedPlans(rows: Array<Record<string, unknown>>): WebinarFeaturedPlan[] {
  return rows
    .map((row) => ({
      id: pickString(row.id),
      code: pickString(row.plan_code ?? row.code),
      name: pickString(row.name ?? row.plan_code ?? row.code, "Webinar Featured Plan"),
      description: typeof row.description === "string" ? row.description : null,
      durationDays: toNumber(row.duration_days),
      amount: toNumber(row.price ?? row.amount),
      currency: pickString(row.currency, "INR"),
      isActive: row.is_active === null ? true : toBoolean(row.is_active),
      sortOrder: toNumber(row.sort_order),
    }))
    .filter((row) => row.id.length > 0 && row.durationDays > 0 && row.amount > 0);
}

export function isWebinarPromotable(webinar: {
  approval_status: string;
  status: string;
  ends_at: string | null;
}) {
  if (webinar.approval_status !== "approved") return false;
  if (!["scheduled", "live"].includes(webinar.status)) return false;
  if (!webinar.ends_at) return true;
  const endMs = new Date(webinar.ends_at).getTime();
  if (Number.isNaN(endMs)) return false;
  return endMs > Date.now();
}

export async function getNextWebinarFeaturedWindow(admin: SupabaseClient, webinarId: string, durationDays: number): Promise<WebinarFeaturedWindow> {
  const nowIso = new Date().toISOString();

  const rpcArgsVariants: Array<Record<string, unknown>> = [
    { p_webinar_id: webinarId, p_duration_days: durationDays },
    { webinar_id: webinarId, duration_days: durationDays },
  ];

  for (const args of rpcArgsVariants) {
    const { data, error } = await admin.rpc("get_next_webinar_featured_window", args);
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
    .from("webinar_featured_subscriptions")
    .select("ends_at")
    .eq("webinar_id", webinarId)
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
