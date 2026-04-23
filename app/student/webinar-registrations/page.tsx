import Link from "next/link";

import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveWebinarAccessState } from "@/lib/webinars/access-state";

type WebinarFilter = "all" | "upcoming" | "free" | "paid";

type WebinarRegistrationRow = {
  id: string;
  webinar_id: string;
  webinar_order_id: string | null;
  created_at: string;
  registered_at: string | null;
  registration_status: string;
  payment_status: string;
  access_status: string;
  webinars:
    | {
        title: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        webinar_mode: string | null;
              meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        title: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        webinar_mode: string | null;
              meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

type WebinarOrderRow = {
  id: string;
  webinar_id: string;
  payment_status: string | null;
  paid_at: string | null;
  created_at: string;
  access_status: string | null;
  webinars:
    | {
        title: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        webinar_mode: string | null;
              meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        title: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        webinar_mode: string | null;
              meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

type CombinedWebinarAccess = {
  id: string;
  webinar_id: string;
  webinar_order_id: string | null;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  webinar_mode: string;
  meeting_provider: string | null;
  institute_name: string | null;
  registration_status: string;
  payment_status: string;
  access_status: string;
  source: "registration" | "order_fallback";
  created_at: string;
};

function getSearchFilter(value: string | string[] | undefined): WebinarFilter {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "upcoming" || normalized === "free" || normalized === "paid") return normalized;
  return "all";
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toLabel(value: string | null | undefined) {
  return String(value ?? "unknown")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function webinarLifecycleLabel(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) return "Access Granted";
  const now = Date.now();
  const startsMs = new Date(startsAt).getTime();
  const endsMs = endsAt ? new Date(endsAt).getTime() : null;
  if (Number.isFinite(endsMs) && (endsMs as number) < now) return "Completed";
  if (startsMs <= now && (!endsMs || (endsMs as number) >= now)) return "Live";
  return "Upcoming";
}

const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);

function isPaidLikeStatus(value: string | null | undefined) {
  return SUCCESS_PAYMENT_STATUSES.has(String(value ?? "").trim().toLowerCase());
}

export default async function StudentWebinarRegistrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string | string[] }>;
}) {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const resolvedParams = searchParams ? await searchParams : undefined;
  const activeFilter = getSearchFilter(resolvedParams?.filter);

  const [registrationResult, paidOrdersResult] = await Promise.all([
    dataClient
      .from("webinar_registrations")
      .select("id,webinar_id,webinar_order_id,created_at,registered_at,registration_status,payment_status,access_status,webinars(title,starts_at,ends_at,timezone,webinar_mode,meeting_provider,institutes(name))")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .returns<WebinarRegistrationRow[]>(),
    dataClient
      .from("webinar_orders")
      .select("id,webinar_id,payment_status,paid_at,created_at,access_status,webinars(title,starts_at,ends_at,timezone,webinar_mode,meeting_provider,institutes(name))")
      .eq("student_id", user.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .returns<WebinarOrderRow[]>(),
  ]);

  const registrationRows = registrationResult.data ?? [];
  const paidOrders = (paidOrdersResult.data ?? []).filter((row) => isPaidLikeStatus(row.payment_status));

  const byWebinarId = new Map<string, CombinedWebinarAccess>();

  for (const row of registrationRows) {
    const webinar = pickOne(row.webinars);
    const institute = pickOne(webinar?.institutes);
    byWebinarId.set(row.webinar_id, {
      id: row.id,
      webinar_id: row.webinar_id,
      webinar_order_id: row.webinar_order_id,
      title: webinar?.title ?? row.webinar_id,
      starts_at: webinar?.starts_at ?? null,
      ends_at: webinar?.ends_at ?? null,
      timezone: webinar?.timezone ?? "Asia/Kolkata",
      webinar_mode: webinar?.webinar_mode ?? (row.payment_status === "paid" ? "paid" : "free"),
      meeting_provider: webinar?.meeting_provider ?? null,
      institute_name: institute?.name ?? null,
      registration_status: row.registration_status,
      payment_status: row.payment_status,
      access_status: row.access_status,
      source: "registration",
      created_at: row.registered_at ?? row.created_at,
    });
  }

  for (const order of paidOrders) {
    if (byWebinarId.has(order.webinar_id)) continue;
    const webinar = pickOne(order.webinars);
    const institute = pickOne(webinar?.institutes);
    byWebinarId.set(order.webinar_id, {
      id: `fallback-${order.id}`,
      webinar_id: order.webinar_id,
      webinar_order_id: order.id,
      title: webinar?.title ?? order.webinar_id,
      starts_at: webinar?.starts_at ?? null,
      ends_at: webinar?.ends_at ?? null,
      timezone: webinar?.timezone ?? "Asia/Kolkata",
      webinar_mode: webinar?.webinar_mode ?? "paid",
      meeting_provider: webinar?.meeting_provider ?? null,
      institute_name: institute?.name ?? null,
      registration_status: "registered",
      payment_status: "paid",
      access_status: order.access_status ?? "locked",
      source: "order_fallback",
      created_at: order.paid_at ?? order.created_at,
    });
  }

  const allItems = Array.from(byWebinarId.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const canonicalStateByWebinarId = new Map(
    await Promise.all(
      allItems.map(async (item) => {
        try {
          const resolved = await resolveWebinarAccessState(dataClient, item.webinar_id, user.id);
          return [item.webinar_id, resolved] as const;
        } catch (error) {
          console.error("[student/webinar-registrations] resolve_access_state_failed", {
            user_id: user.id,
            webinar_id: item.webinar_id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [item.webinar_id, null] as const;
        }
      }),
    ),
  );
  const now = Date.now();
  const filteredItems = allItems.filter((item) => {
    if (activeFilter === "upcoming") {
      return Boolean(item.starts_at) && new Date(item.starts_at as string).getTime() > now;
    }
    if (activeFilter === "free") {
      return item.payment_status === "not_required" || item.webinar_mode === "free";
    }
    if (activeFilter === "paid") {
      return item.payment_status === "paid" || item.webinar_mode === "paid";
    }
    return true;
  });

  const filterLink = (filter: WebinarFilter, label: string) => (
    <Link
      href={`/student/webinar-registrations?filter=${filter}`}
      className={`rounded border px-3 py-1 text-sm ${activeFilter === filter ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-700"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Webinar Registrations</h1>
          <p className="mt-1 text-sm text-slate-600">Unified view of free and paid webinar access.</p>
        </div>
        <Link href="/student/dashboard" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
          Back to Dashboard
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filterLink("all", "All")}
        {filterLink("upcoming", "Upcoming")}
        {filterLink("free", "Free")}
        {filterLink("paid", "Paid")}
      </div>
      {registrationResult.error ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Unable to load some registration records right now. Please refresh in a moment.
        </p>
      ) : null}
      {paidOrdersResult.error ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Unable to load webinar order records right now. Refund options may be temporarily unavailable.
        </p>
      ) : null}

      {filteredItems.length === 0 ? (
        <p className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">No webinar registrations found for this filter.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredItems.map((item) => {
            const canonicalState = canonicalStateByWebinarId.get(item.webinar_id);
            const canJoin = ["granted", "revealed"].includes(canonicalState?.state ?? "no_access");
            const paidLike = isPaidLikeStatus(item.payment_status) || item.webinar_mode === "paid";
            const canRequestRefund = paidLike && Boolean(item.webinar_order_id) && Boolean(canonicalState?.refundAllowed);

            return (
            <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{item.title}</p>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.source === "order_fallback" ? "Synced from paid order" : "Registration"}</span>
              </div>
              <p className="mt-1 text-slate-700">Time: {formatDate(item.starts_at)}</p>
              <p className="text-slate-700">Ends: {formatDate(item.ends_at)} · Timezone: {item.timezone ?? "Asia/Kolkata"}</p>
              <p className="text-slate-700">Mode: {toLabel(item.webinar_mode)} · Provider: {item.meeting_provider ?? "N/A"}</p>
              <p className="text-slate-700">Institute: {item.institute_name ?? "N/A"}</p>
              <p className="text-slate-700">Registration: {toLabel(item.registration_status)} · Payment: {toLabel(item.payment_status)} · Access: {toLabel(item.access_status)}</p>
              {canJoin ? <p className="text-slate-700">Status: {webinarLifecycleLabel(item.starts_at, item.ends_at)} · Access Granted</p> : null}
              {canJoin ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={`/student/webinars/${item.webinar_id}/join`} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                    Join Webinar
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-600">Registration Confirmed. Join access unlocks 15 minutes before webinar starts.</p>
              )}
              {canRequestRefund ? (
                <div className="mt-2">
                  <RefundRequestButton
                    orderType="webinar"
                    orderId={item.webinar_order_id as string}
                    buttonLabel="Request Webinar Refund"
                  />
                </div>
              ) : null}
              {paidLike && !canRequestRefund ? (
                <p className="mt-2 text-xs text-amber-700">{canonicalState?.refundBlockedReason ?? "Refund not available for this webinar at the moment."}</p>
              ) : null}
              <p className="text-xs text-slate-500">Webinar ID: {item.webinar_id}</p>
            </div>
          )})}
        </div>
      )}
    </div>
  );
}
