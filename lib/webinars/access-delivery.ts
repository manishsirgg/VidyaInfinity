import type { SupabaseClient } from "@supabase/supabase-js";

import { siteConfig } from "@/lib/constants/site";

type WebinarAccessDeliveryPayload = {
  supabase: SupabaseClient;
  registrationId: string;
  webinarId: string;
  studentId: string;
};

type DeliveryMetadata = {
  access_delivery?: {
    attempted_at?: string;
    last_sent_at?: string;
    email?: { sent?: boolean; sent_at?: string; error?: string | null };
    whatsapp?: { sent?: boolean; sent_at?: string; error?: string | null };
  };
  [key: string]: unknown;
};

function cleanPhone(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
}

function formatDateTime(value: string | null, timezone: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone ?? "Asia/Kolkata" }).format(date);
}

async function sendEmail(to: string | null, subject: string, message: string) {
  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) return { ok: false, error: "Email webhook not configured" };
  if (!to) return { ok: false, error: "Missing email" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: "webinar_access_granted", to, payload: { subject, title: subject, message } }),
  });
  if (response.ok) return { ok: true as const, error: null };
  return { ok: false as const, error: (await response.text()).slice(0, 200) };
}

async function sendWhatsApp(phone: string | null, message: string) {
  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const to = cleanPhone(phone);
  if (!endpoint || !token) return { ok: false, error: "WhatsApp API not configured" };
  if (!to) return { ok: false, error: "Missing valid phone" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, type: "text", message }),
  });
  if (response.ok) return { ok: true as const, error: null };
  return { ok: false as const, error: (await response.text()).slice(0, 200) };
}

export async function deliverWebinarAccess(payload: WebinarAccessDeliveryPayload) {
  const { data: registration, error: registrationError } = await payload.supabase
    .from("webinar_registrations")
    .select("id,access_status,payment_status,metadata,webinar_id,student_id,email_sent_at,whatsapp_sent_at,access_granted_at")
    .eq("id", payload.registrationId)
    .eq("webinar_id", payload.webinarId)
    .eq("student_id", payload.studentId)
    .maybeSingle<{ id: string; access_status: string; payment_status: string; metadata: DeliveryMetadata | null; webinar_id: string; student_id: string; email_sent_at: string | null; whatsapp_sent_at: string | null; access_granted_at: string | null }>();

  if (registrationError) throw new Error(registrationError.message);
  if (!registration) return;
  if (registration.access_status !== "granted" || !["paid", "not_required"].includes(registration.payment_status)) return;

  const existingMeta = (registration.metadata ?? {}) as DeliveryMetadata;
  const priorDelivery = existingMeta.access_delivery ?? {};
  const emailAlreadySent = priorDelivery.email?.sent === true;
  const whatsappAlreadySent = priorDelivery.whatsapp?.sent === true;
  if (emailAlreadySent && whatsappAlreadySent) return;

  const [{ data: webinar }, { data: profile }] = await Promise.all([
    payload.supabase.from("webinars").select("id,title,starts_at,ends_at,timezone,meeting_provider,institute_id").eq("id", payload.webinarId).maybeSingle<{ id: string; title: string; starts_at: string | null; ends_at: string | null; timezone: string | null; meeting_provider: string | null; institute_id: string }>(),
    payload.supabase.from("profiles").select("id,full_name,email,phone").eq("id", payload.studentId).maybeSingle<{ id: string; full_name: string | null; email: string | null; phone: string | null }>(),
  ]);
  if (!webinar) return;

  const revealWindowAt = webinar.starts_at ? new Date(webinar.starts_at).getTime() - 15 * 60 * 1000 : Number.NaN;
  if (Number.isFinite(revealWindowAt) && Date.now() < revealWindowAt) return;

  const { data: institute } = await payload.supabase.from("institutes").select("id,name").eq("id", webinar.institute_id).maybeSingle<{ id: string; name: string | null }>();
  const secureJoinUrl = `${siteConfig.url}/student/webinars/${webinar.id}/join`;

  const message = [
    `Hi ${profile?.full_name ?? profile?.email ?? "Student"}, your webinar access is confirmed.`,
    `Webinar: ${webinar.title}`,
    `Institute: ${institute?.name ?? "Institute"}`,
    `Starts: ${formatDateTime(webinar.starts_at, webinar.timezone)}`,
    `Ends: ${formatDateTime(webinar.ends_at, webinar.timezone)}`,
    `Timezone: ${webinar.timezone ?? "Asia/Kolkata"}`,
    `Provider: ${webinar.meeting_provider ?? "Google Meet"}`,
    `Join securely in Vidya Infinity: ${secureJoinUrl}`,
    "Use the secure join button/link inside Vidya Infinity.",
    `Support: ${siteConfig.email} | ${siteConfig.phone}`,
  ].join("\n");

  const nextMeta: DeliveryMetadata = { ...existingMeta, access_delivery: { ...priorDelivery, attempted_at: new Date().toISOString(), email: { ...priorDelivery.email }, whatsapp: { ...priorDelivery.whatsapp } } };

  console.info("[webinars/access-delivery] webinar_access_delivery_started", { event: "webinar_access_delivery_started", webinar_id: payload.webinarId, student_id: payload.studentId, registration_id: registration.id });

  if (!emailAlreadySent) {
    const result = await sendEmail(profile?.email ?? null, `Webinar access confirmed: ${webinar.title}`, message);
    nextMeta.access_delivery!.email = result.ok ? { sent: true, sent_at: new Date().toISOString(), error: null } : { sent: false, error: result.error };
  }
  if (!whatsappAlreadySent) {
    const result = await sendWhatsApp(profile?.phone ?? null, message);
    nextMeta.access_delivery!.whatsapp = result.ok ? { sent: true, sent_at: new Date().toISOString(), error: null } : { sent: false, error: result.error };
  }

  if (nextMeta.access_delivery?.email?.sent || nextMeta.access_delivery?.whatsapp?.sent) nextMeta.access_delivery!.last_sent_at = new Date().toISOString();

  const { error: updateError } = await payload.supabase
    .from("webinar_registrations")
    .update({
      metadata: nextMeta,
      email_sent_at: nextMeta.access_delivery?.email?.sent ? nextMeta.access_delivery.email?.sent_at ?? registration.email_sent_at : registration.email_sent_at,
      whatsapp_sent_at: nextMeta.access_delivery?.whatsapp?.sent ? nextMeta.access_delivery.whatsapp?.sent_at ?? registration.whatsapp_sent_at : registration.whatsapp_sent_at,
      last_delivery_attempt_at: new Date().toISOString(),
      access_granted_at: registration.access_granted_at ?? null,
      access_delivery_status: nextMeta.access_delivery?.email?.sent || nextMeta.access_delivery?.whatsapp?.sent ? "delivered" : "failed",
      delivery_error: nextMeta.access_delivery?.email?.error ?? nextMeta.access_delivery?.whatsapp?.error ?? null,
    })
    .eq("id", registration.id)
    .eq("student_id", payload.studentId);

  if (updateError) throw new Error(updateError.message);
}
