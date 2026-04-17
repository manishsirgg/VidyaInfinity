type ServiceInquiryPayload = {
  name: string;
  email: string;
  phone: string;
  inquiryType: string;
  message?: string;
};

type IntegrationResult = {
  channel: string;
  ok: boolean;
  error?: string;
};

function jsonHeaders(extra: HeadersInit = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

function cleanPhoneNumber(value: string) {
  return value.replace(/[^0-9+]/g, "").trim();
}

async function runMailchimp(payload: ServiceInquiryPayload): Promise<IntegrationResult> {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;

  if (!apiKey || !audienceId || !serverPrefix) {
    return { channel: "mailchimp", ok: false, error: "Mailchimp is not configured" };
  }

  const authHeader = Buffer.from(`x:${apiKey}`).toString("base64");
  const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members`;

  const response = await fetch(url, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Basic ${authHeader}` }),
    body: JSON.stringify({
      email_address: payload.email,
      status_if_new: "subscribed",
      status: "subscribed",
      merge_fields: {
        FNAME: payload.name,
        PHONE: payload.phone,
      },
      tags: ["service_inquiry", payload.inquiryType],
    }),
  });

  if (response.ok || response.status === 400) {
    return { channel: "mailchimp", ok: true };
  }

  const body = await response.text();
  return { channel: "mailchimp", ok: false, error: body.slice(0, 160) };
}

async function runOneSignal(payload: ServiceInquiryPayload): Promise<IntegrationResult> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    return { channel: "onesignal", ok: false, error: "OneSignal API is not configured" };
  }

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Basic ${apiKey}` }),
    body: JSON.stringify({
      app_id: appId,
      included_segments: ["Subscribed Users"],
      headings: { en: "New Lead Received" },
      contents: { en: `${payload.name} submitted a ${payload.inquiryType} request.` },
      data: {
        type: "service_inquiry",
        email: payload.email,
        phone: payload.phone,
      },
    }),
  });

  if (response.ok) {
    return { channel: "onesignal", ok: true };
  }

  const body = await response.text();
  return { channel: "onesignal", ok: false, error: body.slice(0, 160) };
}

async function runEmailAlert(payload: ServiceInquiryPayload): Promise<IntegrationResult> {
  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) {
    return { channel: "email", ok: false, error: "Email webhook is not configured" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      template: "service_inquiry_notification",
      to: process.env.LEAD_NOTIFICATION_EMAIL ?? "infovidyainfinity@gmail.com",
      payload,
    }),
  });

  if (response.ok) {
    return { channel: "email", ok: true };
  }

  const body = await response.text();
  return { channel: "email", ok: false, error: body.slice(0, 160) };
}

async function runWhatsAppAlert(payload: ServiceInquiryPayload): Promise<IntegrationResult> {
  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER ?? "+917828199500";

  if (!endpoint || !token) {
    return { channel: "whatsapp_alert", ok: false, error: "WhatsApp API is not configured" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to: adminNumber,
      type: "text",
      message: `New lead\nName: ${payload.name}\nEmail: ${payload.email}\nPhone: ${payload.phone}\nService: ${payload.inquiryType}\nMessage: ${payload.message ?? "-"}`,
    }),
  });

  if (response.ok) {
    return { channel: "whatsapp_alert", ok: true };
  }

  const body = await response.text();
  return { channel: "whatsapp_alert", ok: false, error: body.slice(0, 160) };
}

async function runWhatsAppAcknowledgement(payload: ServiceInquiryPayload): Promise<IntegrationResult> {
  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;

  if (!endpoint || !token) {
    return { channel: "whatsapp_ack", ok: false, error: "WhatsApp API is not configured" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to: cleanPhoneNumber(payload.phone),
      type: "template",
      template: {
        name: "lead_acknowledgement",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: payload.name }],
          },
        ],
      },
    }),
  });

  if (response.ok) {
    return { channel: "whatsapp_ack", ok: true };
  }

  const body = await response.text();
  return { channel: "whatsapp_ack", ok: false, error: body.slice(0, 160) };
}

export async function triggerServiceInquiryAutomations(payload: ServiceInquiryPayload) {
  const settled = await Promise.allSettled([
    runMailchimp(payload),
    runOneSignal(payload),
    runEmailAlert(payload),
    runWhatsAppAlert(payload),
    runWhatsAppAcknowledgement(payload),
  ]);

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const channels = ["mailchimp", "onesignal", "email", "whatsapp_alert", "whatsapp_ack"];
    return {
      channel: channels[index],
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : "Unknown integration error",
    } satisfies IntegrationResult;
  });
}
