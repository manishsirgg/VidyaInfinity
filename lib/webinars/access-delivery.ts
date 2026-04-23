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
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone ?? "Asia/Kolkata",
  }).format(date);
}

async function sendEmail(to: string | null, subject: string, message: string) {
  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) return { ok: false, error: "Email webhook not configured" };
  if (!to) return { ok: false, error: "Missing email" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template: "webinar_access_granted",
      to,
      payload: {
        subject,
        title: subject,
        message,
      },
    }),
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      type: "text",
      message,
    }),
  });

  if (response.ok) return { ok: true as const, error: null };
  return { ok: false as const, error: (await response.text()).slice(0, 200) };
}

export async function deliverWebinarAccess(payload: WebinarAccessDeliveryPayload) {
  const { data: registration, error: registrationError } = await payload.supabase
    .from("webinar_registrations")
    .select("id,access_status,payment_status,metadata,webinar_id,student_id,email_sent_at,whatsapp_sent_at")
    .eq("id", payload.registrationId)
    .eq("webinar_id", payload.webinarId)
    .eq("student_id", payload.studentId)
    .maybeSingle<{
      id: string;
      access_status: string;
      payment_status: string;
      metadata: DeliveryMetadata | null;
      webinar_id: string;
      student_id: string;
      email_sent_at: string | null;
      whatsapp_sent_at: string | null;
    }>();

  if (registrationError) throw new Error(registrationError.message);
  if (!registration) return;

  const validPayment = ["paid", "not_required"].includes(registration.payment_status);
  if (registration.access_status !== "granted" || !validPayment) return;

  console.info("[webinars/access-delivery] webinar_access_granted", {
    event: "webinar_access_granted",
    registration_id: registration.id,
    webinar_id: payload.webinarId,
    student_id: payload.studentId,
    payment_status: registration.payment_status,
  });

  const existingMeta = (registration.metadata ?? {}) as DeliveryMetadata;
  const priorDelivery = existingMeta.access_delivery ?? {};
  const emailAlreadySent = priorDelivery.email?.sent === true;
  const whatsappAlreadySent = priorDelivery.whatsapp?.sent === true;

  if (emailAlreadySent && whatsappAlreadySent) {
    console.info("[webinars/access-delivery] webinar_delivery_skipped_already_sent", {
      event: "webinar_delivery_skipped_already_sent",
      registration_id: registration.id,
      webinar_id: payload.webinarId,
      student_id: payload.studentId,
    });
    return;
  }

  const [{ data: webinar }, { data: profile }] = await Promise.all([
    payload.supabase
      .from("webinars")
      .select("id,title,starts_at,ends_at,timezone,meeting_url,meeting_provider,institute_id")
      .eq("id", payload.webinarId)
      .maybeSingle<{
        id: string;
        title: string;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        meeting_url: string | null;
        meeting_provider: string | null;
        institute_id: string;
      }>(),
    payload.supabase
      .from("profiles")
      .select("id,full_name,email,phone")
      .eq("id", payload.studentId)
      .maybeSingle<{ id: string; full_name: string | null; email: string | null; phone: string | null }>(),
  ]);

  const resolvedInstitute = webinar
    ? await payload.supabase
        .from("institutes")
        .select("id,name")
        .eq("id", webinar.institute_id)
        .maybeSingle<{ id: string; name: string | null }>()
    : { data: null as { id: string; name: string | null } | null };

  if (!webinar?.meeting_url) {
    console.warn("[webinars/access-delivery] webinar_delivery_blocked_missing_meeting_url", {
      event: "webinar_delivery_blocked_missing_meeting_url",
      registration_id: registration.id,
      webinar_id: payload.webinarId,
      student_id: payload.studentId,
    });
    return;
  }

  const now = Date.now();
  const revealWindowAt = webinar.starts_at ? new Date(webinar.starts_at).getTime() - 15 * 60 * 1000 : Number.NaN;
  if (Number.isFinite(revealWindowAt) && now < revealWindowAt) {
    console.info("[webinars/access-delivery] webinar_delivery_deferred_before_reveal_window", {
      event: "webinar_delivery_deferred_before_reveal_window",
      registration_id: registration.id,
      webinar_id: payload.webinarId,
      student_id: payload.studentId,
      reveal_window_at: new Date(revealWindowAt).toISOString(),
    });
    return;
  }

  const timezone = webinar.timezone ?? "Asia/Kolkata";
  const studentName = profile?.full_name ?? profile?.email ?? "Student";
  const instituteName = resolvedInstitute.data?.name ?? "Institute";
  const support = `${siteConfig.email} | ${siteConfig.phone}`;

  const detailsMessage = [
    `Hi ${studentName}, your webinar access is granted.`,
    `Webinar: ${webinar.title}`,
    `Institute: ${instituteName}`,
    `Starts: ${formatDateTime(webinar.starts_at, timezone)}`,
    `Ends: ${formatDateTime(webinar.ends_at, timezone)}`,
    `Timezone: ${timezone}`,
    `Provider: ${webinar.meeting_provider ?? "Google Meet"}`,
    `Join: ${webinar.meeting_url}`,
    `Support: ${support}`,
  ].join("\n");

  const nextMeta: DeliveryMetadata = {
    ...existingMeta,
    access_delivery: {
      ...priorDelivery,
      attempted_at: new Date().toISOString(),
      email: { ...priorDelivery.email },
      whatsapp: { ...priorDelivery.whatsapp },
    },
  };

  console.info("[webinars/access-delivery] webinar_delivery_started", {
    event: "webinar_delivery_started",
    registration_id: registration.id,
    webinar_id: payload.webinarId,
    student_id: payload.studentId,
    send_email: !emailAlreadySent,
    send_whatsapp: !whatsappAlreadySent,
  });

  if (!emailAlreadySent) {
    const emailResult = await sendEmail(profile?.email ?? null, `Webinar access granted: ${webinar.title}`, detailsMessage);
    if (emailResult.ok) {
      nextMeta.access_delivery!.email = { sent: true, sent_at: new Date().toISOString(), error: null };
      console.info("[webinars/access-delivery] webinar_email_delivery_succeeded", {
        event: "webinar_email_delivery_succeeded",
        registration_id: registration.id,
        webinar_id: payload.webinarId,
        student_id: payload.studentId,
      });
    } else {
      nextMeta.access_delivery!.email = { sent: false, sent_at: undefined, error: emailResult.error };
      console.error("[webinars/access-delivery] webinar_email_delivery_failed", {
        event: "webinar_email_delivery_failed",
        registration_id: registration.id,
        webinar_id: payload.webinarId,
        student_id: payload.studentId,
        error: emailResult.error,
      });
    }
  }

  if (!whatsappAlreadySent) {
    const whatsappResult = await sendWhatsApp(profile?.phone ?? null, detailsMessage);
    if (whatsappResult.ok) {
      nextMeta.access_delivery!.whatsapp = { sent: true, sent_at: new Date().toISOString(), error: null };
      console.info("[webinars/access-delivery] webinar_whatsapp_delivery_succeeded", {
        event: "webinar_whatsapp_delivery_succeeded",
        registration_id: registration.id,
        webinar_id: payload.webinarId,
        student_id: payload.studentId,
      });
    } else {
      nextMeta.access_delivery!.whatsapp = { sent: false, sent_at: undefined, error: whatsappResult.error };
      console.error("[webinars/access-delivery] webinar_whatsapp_delivery_failed", {
        event: "webinar_whatsapp_delivery_failed",
        registration_id: registration.id,
        webinar_id: payload.webinarId,
        student_id: payload.studentId,
        error: whatsappResult.error,
      });
    }
  }

  if (nextMeta.access_delivery?.email?.sent || nextMeta.access_delivery?.whatsapp?.sent) {
    nextMeta.access_delivery!.last_sent_at = new Date().toISOString();
  }

  const deliveredAt = nextMeta.access_delivery?.last_sent_at ?? null;
  const { error: updateError } = await payload.supabase
    .from("webinar_registrations")
    .update({
      metadata: nextMeta,
      email_sent_at: nextMeta.access_delivery?.email?.sent ? nextMeta.access_delivery?.email?.sent_at ?? registration.email_sent_at ?? deliveredAt : registration.email_sent_at,
      whatsapp_sent_at: nextMeta.access_delivery?.whatsapp?.sent
        ? nextMeta.access_delivery?.whatsapp?.sent_at ?? registration.whatsapp_sent_at ?? deliveredAt
        : registration.whatsapp_sent_at,
      access_granted_at: deliveredAt,
      access_delivery_status: nextMeta.access_delivery?.email?.sent || nextMeta.access_delivery?.whatsapp?.sent ? "delivered" : "pending",
    })
    .eq("id", registration.id)
    .eq("student_id", payload.studentId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
