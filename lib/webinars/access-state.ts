import type { SupabaseClient } from "@supabase/supabase-js";

const REVEAL_WINDOW_MINUTES = 15;
const REFUND_CUTOFF_MINUTES = 30;

export type WebinarAccessState =
  | "no_access"
  | "registered_confirmed"
  | "locked_until_window"
  | "revealed"
  | "granted"
  | "refunded"
  | "revoked";

type WebinarForAccess = { id: string; starts_at: string | null; ends_at: string | null; webinar_mode: "free" | "paid" | null };
type WebinarRegistrationForAccess = {
  id: string;
  webinar_order_id: string | null;
  registration_status: string | null;
  payment_status: string | null;
  access_status: string | null;
  access_delivery_status?: string | null;
  access_granted_at: string | null;
  reveal_started_at: string | null;
  email_sent_at: string | null;
  whatsapp_sent_at: string | null;
};
type WebinarOrderForAccess = {
  id: string;
  webinar_id: string;
  payment_status: string | null;
  order_status: string | null;
  access_status: string | null;
  paid_at: string | null;
};

export type WebinarAccessResolution = {
  state: WebinarAccessState;
  revealAt: string | null;
  revealWindowOpen: boolean;
  refundAllowed: boolean;
  refundBlockedReason: string | null;
  registration: WebinarRegistrationForAccess | null;
  orderFallback: WebinarOrderForAccess | null;
};

function resolveRevealAt(startsAt: string | null) {
  if (!startsAt) return null;
  const ts = new Date(startsAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts - REVEAL_WINDOW_MINUTES * 60 * 1000).toISOString();
}

export async function resolveWebinarAccessState(
  supabase: SupabaseClient,
  webinarId: string,
  studentId: string,
  webinarSeed?: WebinarForAccess | null,
): Promise<WebinarAccessResolution> {
  const now = Date.now();

  const [{ data: webinar }, { data: registration }, { data: paidOrderFallback }] = await Promise.all([
    webinarSeed
      ? Promise.resolve({ data: webinarSeed })
      : supabase.from("webinars").select("id,starts_at,ends_at,webinar_mode").eq("id", webinarId).maybeSingle<WebinarForAccess>(),
    supabase
      .from("webinar_registrations")
      .select("id,webinar_order_id,registration_status,payment_status,access_status,access_delivery_status,access_granted_at,reveal_started_at,email_sent_at,whatsapp_sent_at")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<WebinarRegistrationForAccess>(),
    supabase
      .from("webinar_orders")
      .select("id,webinar_id,payment_status,order_status,access_status,paid_at")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .eq("payment_status", "paid")
      .in("order_status", ["confirmed", "completed"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<WebinarOrderForAccess>(),
  ]);

  const revealAt = resolveRevealAt(webinar?.starts_at ?? null);
  const revealTs = revealAt ? new Date(revealAt).getTime() : Number.NaN;
  const revealWindowOpen = Number.isFinite(revealTs) ? now >= revealTs : true;

  const paymentStatus = String(registration?.payment_status ?? "").toLowerCase();
  const accessStatus = String(registration?.access_status ?? "").toLowerCase();
  const registrationStatus = String(registration?.registration_status ?? "").toLowerCase();

  let state: WebinarAccessState = "no_access";

  if (registration) {
    if (paymentStatus === "refunded") {
      state = "refunded";
    } else if (accessStatus === "revoked" || registrationStatus === "revoked") {
      state = "revoked";
    } else if (accessStatus === "granted") {
      // Canonical entitlement truth from registration row.
      state = "granted";
    } else if (accessStatus === "revealed") {
      state = "revealed";
    } else if (registrationStatus === "registered" && ["paid", "not_required"].includes(paymentStatus)) {
      state = revealWindowOpen ? "revealed" : "registered_confirmed";
    }
  } else if (paidOrderFallback) {
    // Transaction truth fallback when registration row is not available yet.
    state = "registered_confirmed";
  }

  if (state === "registered_confirmed" && revealWindowOpen) {
    state = "locked_until_window";
  }

  const startsAtMs = webinar?.starts_at ? new Date(webinar.starts_at).getTime() : Number.NaN;
  const beforeCutoff = Number.isFinite(startsAtMs) ? now < startsAtMs - REFUND_CUTOFF_MINUTES * 60 * 1000 : true;

  const deliveryReleased = Boolean(
    registration?.access_granted_at || registration?.reveal_started_at || registration?.email_sent_at || registration?.whatsapp_sent_at,
  );
  const blockedByAccessStatus = ["granted", "revealed", "revoked"].includes(accessStatus);

  const orderPaymentStatus = String(paidOrderFallback?.payment_status ?? "").toLowerCase();
  const orderStatus = String(paidOrderFallback?.order_status ?? "").toLowerCase();

  const refundAllowed =
    Boolean(paidOrderFallback?.id) &&
    orderPaymentStatus === "paid" &&
    ["confirmed", "completed"].includes(orderStatus) &&
    beforeCutoff &&
    !deliveryReleased &&
    !blockedByAccessStatus &&
    !["refunded", "revoked"].includes(state);

  const refundBlockedReason = refundAllowed ? null : "Refunds are not available once webinar access details have been issued.";

  console.info("[webinars/access-state] webinar_access_resolved", {
    event: "webinar_access_resolved",
    webinar_id: webinarId,
    student_id: studentId,
    state,
    reveal_at: revealAt,
    reveal_window_open: revealWindowOpen,
    registration_status: registrationStatus || null,
    access_status: accessStatus || null,
    access_delivery_status: registration?.access_delivery_status ?? null,
    used_order_fallback: !registration && Boolean(paidOrderFallback),
  });

  return {
    state,
    revealAt,
    revealWindowOpen,
    refundAllowed,
    refundBlockedReason,
    registration: registration ?? null,
    orderFallback: paidOrderFallback ?? null,
  };
}

export async function getWebinarAccessState(supabase: SupabaseClient, webinarId: string, studentId: string): Promise<WebinarAccessState> {
  const resolved = await resolveWebinarAccessState(supabase, webinarId, studentId);
  return resolved.state;
}
