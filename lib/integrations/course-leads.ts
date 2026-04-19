type CourseLeadPayload = {
  name: string;
  email?: string;
  phone?: string;
  courseId: string;
  message?: string;
  contactPreference: "email" | "whatsapp" | "both";
};

type IntegrationResult = {
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

async function runLeadEmailAlert(payload: CourseLeadPayload): Promise<IntegrationResult> {
  if (!payload.email) {
    return { channel: "email", ok: false, error: "Lead email is missing" };
  }

  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) {
    return { channel: "email", ok: false, error: "Email webhook is not configured" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      template: "course_lead_notification",
      to: process.env.LEAD_NOTIFICATION_EMAIL ?? "infovidyainfinity@gmail.com",
      payload,
    }),
  });

  if (response.ok) {
    return { channel: "email", ok: true };
  }

  return { channel: "email", ok: false, error: (await response.text()).slice(0, 160) };
}

async function runLeadWhatsAppAlert(payload: CourseLeadPayload): Promise<IntegrationResult> {
  if (!payload.phone) {
    return { channel: "whatsapp", ok: false, error: "Lead phone number is missing" };
  }

  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER ?? "+917828199500";

  if (!endpoint || !token) {
    return { channel: "whatsapp", ok: false, error: "WhatsApp API is not configured" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to: adminNumber,
      type: "text",
      message: `Course lead\nName: ${payload.name}\nEmail: ${payload.email ?? "-"}\nPhone: ${payload.phone}\nCourse ID: ${payload.courseId}\nMessage: ${payload.message ?? "-"}`,
    }),
  });

  if (response.ok) {
    return { channel: "whatsapp", ok: true };
  }

  return { channel: "whatsapp", ok: false, error: (await response.text()).slice(0, 160) };
}

export async function triggerCourseLeadAutomations(payload: CourseLeadPayload) {
  const jobs: Array<Promise<IntegrationResult>> = [];

  if (payload.contactPreference === "email" || payload.contactPreference === "both") {
    jobs.push(runLeadEmailAlert(payload));
  }

  if (payload.contactPreference === "whatsapp" || payload.contactPreference === "both") {
    jobs.push(runLeadWhatsAppAlert(payload));
  }

  if (jobs.length === 0) return [];

  const channels = jobs.map((_, index) => {
    const selected: IntegrationResult["channel"][] = [];
    if (payload.contactPreference === "email" || payload.contactPreference === "both") selected.push("email");
    if (payload.contactPreference === "whatsapp" || payload.contactPreference === "both") selected.push("whatsapp");
    return selected[index] ?? "email";
  });

  const settled = await Promise.allSettled(jobs);

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      channel: channels[index],
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : "Unknown integration error",
    } satisfies IntegrationResult;
  });
}
