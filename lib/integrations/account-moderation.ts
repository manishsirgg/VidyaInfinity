type ModerationEvent = "approved" | "rejected" | "resubmitted";
type ModerationAudience = "student" | "admin" | "institute";

type ModerationPayload = {
  userId: string;
  role: ModerationAudience;
  event: ModerationEvent;
  userEmail: string;
  userPhone: string | null;
  userName: string;
  rejectionReason?: string | null;
};

type ChannelResult = {
  channel: "email" | "whatsapp";
  ok: boolean;
  error?: string;
};

function jsonHeaders(extra: HeadersInit = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

function cleanPhoneNumber(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
}

function eventCopy(payload: ModerationPayload) {
  if (payload.event === "approved") {
    return {
      subject: "Vidya Infinity registration approved",
      title: "Registration approved",
      message: "Your account has been approved. You can now access approved features.",
      whatsappMessage: `Hi ${payload.userName}, your Vidya Infinity ${payload.role} registration is approved. You can now access approved features.`,
    };
  }

  if (payload.event === "resubmitted") {
    return {
      subject: "Vidya Infinity resubmission received",
      title: "Resubmission received",
      message: "Your corrected profile/documents were received and moved back to admin review.",
      whatsappMessage: `Hi ${payload.userName}, your corrected details were received. Your account is back under review.`,
    };
  }

  const reason = payload.rejectionReason?.trim() || "No reason was provided.";
  return {
    subject: "Vidya Infinity registration update",
    title: "Registration rejected",
    message: `Your registration was rejected. Reason: ${reason}. Please update your profile/documents and resubmit.`,
    whatsappMessage: `Hi ${payload.userName}, your registration was rejected. Reason: ${reason}. Please update details and resubmit.`,
  };
}

async function sendModerationEmail(payload: ModerationPayload): Promise<ChannelResult> {
  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) {
    return { channel: "email", ok: false, error: "Email webhook is not configured" };
  }

  const copy = eventCopy(payload);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      template: "account_moderation_status",
      to: payload.userEmail,
      payload: {
        userId: payload.userId,
        role: payload.role,
        event: payload.event,
        name: payload.userName,
        subject: copy.subject,
        title: copy.title,
        message: copy.message,
        rejectionReason: payload.rejectionReason ?? null,
      },
    }),
  });

  if (response.ok) {
    return { channel: "email", ok: true };
  }

  const body = await response.text();
  return { channel: "email", ok: false, error: body.slice(0, 160) };
}

async function sendModerationWhatsApp(payload: ModerationPayload): Promise<ChannelResult> {
  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const to = cleanPhoneNumber(payload.userPhone);

  if (!endpoint || !token) {
    return { channel: "whatsapp", ok: false, error: "WhatsApp API is not configured" };
  }

  if (!to) {
    return { channel: "whatsapp", ok: false, error: "Missing valid phone number" };
  }

  const copy = eventCopy(payload);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to,
      type: "text",
      message: copy.whatsappMessage,
    }),
  });

  if (response.ok) {
    return { channel: "whatsapp", ok: true };
  }

  const body = await response.text();
  return { channel: "whatsapp", ok: false, error: body.slice(0, 160) };
}

export async function sendModerationExternalNotifications(payload: ModerationPayload) {
  const settled = await Promise.allSettled([sendModerationEmail(payload), sendModerationWhatsApp(payload)]);

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const channel = index === 0 ? "email" : "whatsapp";
    return {
      channel,
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : "Unknown integration error",
    } satisfies ChannelResult;
  });
}
