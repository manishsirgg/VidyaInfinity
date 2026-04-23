import type { SupabaseClient } from "@supabase/supabase-js";

export type WebinarJoinDecision = "denied_not_registered" | "denied_refunded" | "denied_revoked" | "waiting_for_reveal_window" | "allowed";
export type WebinarAccessPhase = "pending" | "confirmed" | "locked_until_window" | "revealed" | "granted" | "revoked" | "refunded";

const REVEAL_WINDOW_MINUTES = 15;

function resolveRevealAt(startsAt: string | null) {
  if (!startsAt) return null;
  const ts = new Date(startsAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts - REVEAL_WINDOW_MINUTES * 60 * 1000).toISOString();
}

export async function resolveWebinarJoinAccess(supabase: SupabaseClient, studentId: string, webinarId: string) {
  const now = Date.now();
  console.info("[webinars/join] webinar_join_access_requested", {
    event: "webinar_join_access_requested",
    webinar_id: webinarId,
    student_id: studentId,
  });

  const [{ data: webinar, error: webinarError }, { data: registration, error: registrationError }, { data: paidOrderFallback }] = await Promise.all([
    supabase
      .from("webinars")
      .select("id,title,starts_at,ends_at,meeting_url,webinar_mode,status")
      .eq("id", webinarId)
      .maybeSingle<{
        id: string;
        title: string;
        starts_at: string | null;
        ends_at: string | null;
        meeting_url: string | null;
        webinar_mode: "free" | "paid";
        status: string;
      }>(),
    supabase
      .from("webinar_registrations")
      .select("id,webinar_order_id,payment_status,access_status,access_granted_at,reveal_started_at,email_sent_at,whatsapp_sent_at")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .maybeSingle<{
        id: string;
        webinar_order_id: string | null;
        payment_status: string | null;
        access_status: string | null;
        access_granted_at: string | null;
        reveal_started_at: string | null;
        email_sent_at: string | null;
        whatsapp_sent_at: string | null;
      }>(),
    supabase
      .from("webinar_orders")
      .select("id,payment_status,order_status")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .eq("payment_status", "paid")
      .in("order_status", ["confirmed", "completed"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string; payment_status: string | null; order_status: string | null }>(),
  ]);

  if (webinarError) throw new Error(webinarError.message);
  if (registrationError) throw new Error(registrationError.message);

  if (!webinar) {
    console.info("[webinars/join] webinar_join_access_denied_not_registered", { event: "webinar_join_access_denied_not_registered", webinar_id: webinarId, student_id: studentId });
    return { decision: "denied_not_registered" as const, webinar: null, registration: registration ?? null, revealAt: null, phase: "pending" as WebinarAccessPhase };
  }

  if (!registration && !paidOrderFallback) {
    console.info("[webinars/join] webinar_join_access_denied_not_registered", { event: "webinar_join_access_denied_not_registered", webinar_id: webinarId, student_id: studentId });
    return { decision: "denied_not_registered" as const, webinar, registration: null, revealAt: resolveRevealAt(webinar.starts_at), phase: "pending" as WebinarAccessPhase };
  }

  const paymentStatus = String(registration?.payment_status ?? paidOrderFallback?.payment_status ?? "").toLowerCase();
  const accessStatus = String(registration?.access_status ?? "granted").toLowerCase();
  if (paymentStatus === "refunded") {
    console.info("[webinars/join] webinar_join_access_denied_refunded", { event: "webinar_join_access_denied_refunded", webinar_id: webinarId, student_id: studentId, registration_id: registration?.id ?? null });
    return { decision: "denied_refunded" as const, webinar, registration, revealAt: resolveRevealAt(webinar.starts_at), phase: "refunded" as WebinarAccessPhase };
  }

  if (accessStatus === "revoked") {
    console.info("[webinars/join] webinar_join_access_denied_revoked", { event: "webinar_join_access_denied_revoked", webinar_id: webinarId, student_id: studentId, registration_id: registration?.id ?? null });
    return { decision: "denied_revoked" as const, webinar, registration, revealAt: resolveRevealAt(webinar.starts_at), phase: "revoked" as WebinarAccessPhase };
  }

  const revealAt = resolveRevealAt(webinar.starts_at);
  const revealTs = revealAt ? new Date(revealAt).getTime() : Number.NaN;
  const revealOpen = Number.isFinite(revealTs) ? now >= revealTs : true;

  if (!revealOpen) {
    console.info("[webinars/join] webinar_join_access_waiting_for_reveal_window", { event: "webinar_join_access_waiting_for_reveal_window", webinar_id: webinarId, student_id: studentId, reveal_at: revealAt });
    return { decision: "waiting_for_reveal_window" as const, webinar, registration, revealAt, phase: "locked_until_window" as WebinarAccessPhase };
  }

  const effectiveMeetingUrl = webinar.meeting_url ?? null;
  if (!effectiveMeetingUrl || accessStatus !== "granted" || !["paid", "not_required"].includes(paymentStatus)) {
    console.info("[webinars/join] webinar_join_access_denied_not_registered", {
      event: "webinar_join_access_denied_not_registered",
      webinar_id: webinarId,
      student_id: studentId,
      registration_id: registration?.id ?? null,
      access_status: accessStatus,
      payment_status: paymentStatus,
    });
    return { decision: "denied_not_registered" as const, webinar, registration, revealAt, phase: "pending" as WebinarAccessPhase };
  }

  if (registration && !registration.reveal_started_at) {
    await supabase
      .from("webinar_registrations")
      .update({ reveal_started_at: new Date().toISOString(), access_delivery_status: "revealed" })
      .eq("id", registration.id)
      .eq("student_id", studentId);
    console.info("[webinars/join] webinar_reveal_window_opened", { event: "webinar_reveal_window_opened", webinar_id: webinarId, student_id: studentId, registration_id: registration?.id ?? null });
  }

  if (registration) {
    await supabase
      .from("webinar_registrations")
      .update({ joined_at: new Date().toISOString(), access_granted_at: registration.access_granted_at ?? new Date().toISOString() })
      .eq("id", registration.id)
      .eq("student_id", studentId);
  }

  console.info("[webinars/join] webinar_join_access_allowed", { event: "webinar_join_access_allowed", webinar_id: webinarId, student_id: studentId, registration_id: registration?.id ?? null, order_fallback_id: paidOrderFallback?.id ?? null });

  return { decision: "allowed" as const, webinar, registration, revealAt, phase: "granted" as WebinarAccessPhase, meetingUrl: effectiveMeetingUrl };
}
