import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";

type PurchaseNotificationPayload = {
  orderId: string;
  paymentId: string;
  courseTitle: string;
  amount: number;
  currency: string;
  student: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  institute: {
    userId: string;
    instituteId: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  adminUserIds: string[];
};

type ChannelResult = {
  channel: "email" | "whatsapp" | "sms";
  ok: boolean;
  error?: string;
};

function jsonHeaders(extra: HeadersInit = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

function cleanPhone(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
}

function paymentLabel(currency: string, amount: number) {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

async function sendEmail(to: string | null, subject: string, message: string): Promise<ChannelResult> {
  const endpoint = process.env.LEAD_EMAIL_WEBHOOK_URL;
  if (!endpoint) return { channel: "email", ok: false, error: "Email webhook not configured" };
  if (!to) return { channel: "email", ok: false, error: "Missing email" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      template: "course_enrollment_payment",
      to,
      payload: {
        subject,
        title: subject,
        message,
      },
    }),
  });

  if (response.ok) return { channel: "email", ok: true };

  const body = await response.text();
  return { channel: "email", ok: false, error: body.slice(0, 200) };
}

async function sendWhatsApp(phone: string | null, message: string): Promise<ChannelResult> {
  const endpoint = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const to = cleanPhone(phone);

  if (!endpoint || !token) return { channel: "whatsapp", ok: false, error: "WhatsApp API not configured" };
  if (!to) return { channel: "whatsapp", ok: false, error: "Missing phone" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to,
      type: "text",
      message,
    }),
  });

  if (response.ok) return { channel: "whatsapp", ok: true };

  const body = await response.text();
  return { channel: "whatsapp", ok: false, error: body.slice(0, 200) };
}

async function sendSms(phone: string | null, message: string): Promise<ChannelResult> {
  const endpoint = process.env.SMS_API_URL;
  const token = process.env.SMS_API_TOKEN;
  const to = cleanPhone(phone);

  if (!endpoint || !token) return { channel: "sms", ok: false, error: "SMS API not configured" };
  if (!to) return { channel: "sms", ok: false, error: "Missing phone" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      to,
      message,
    }),
  });

  if (response.ok) return { channel: "sms", ok: true };
  const body = await response.text();
  return { channel: "sms", ok: false, error: body.slice(0, 200) };
}

async function settleChannels(tasks: Promise<ChannelResult>[]) {
  const settled = await Promise.allSettled(tasks);
  return settled.map((item) => {
    if (item.status === "fulfilled") return item.value;
    return {
      channel: "email",
      ok: false,
      error: item.reason instanceof Error ? item.reason.message : "Unknown error",
    } satisfies ChannelResult;
  });
}

export async function notifyCoursePurchase(payload: PurchaseNotificationPayload) {
  const studentMessage = `Your payment is confirmed for ${payload.courseTitle}. Amount: ${paymentLabel(payload.currency, payload.amount)}. Institute: ${payload.institute.name}. Contact: ${payload.institute.email ?? "-"}, ${payload.institute.phone ?? "-"}.`;

  const instituteMessage = `New enrollment received for ${payload.courseTitle}. Student: ${payload.student.name}, Email: ${payload.student.email ?? "-"}, Phone: ${payload.student.phone ?? "-"}. Amount paid: ${paymentLabel(payload.currency, payload.amount)}.`;

  const adminMessage = `Course payment captured. Course: ${payload.courseTitle}. Student: ${payload.student.name} (${payload.student.email ?? "-"}). Institute: ${payload.institute.name}. Order: ${payload.orderId}. Payment: ${payload.paymentId}.`;

  await Promise.allSettled([
    createAccountNotification({
      userId: payload.student.id,
      type: "payment",
      category: "course_order",
      priority: "high",
      title: "Enrollment confirmed",
      message: studentMessage,
      targetUrl: "/student/purchases",
      actionLabel: "View purchase",
      entityType: "course_order",
      entityId: payload.orderId,
      dedupeKey: `course-order-paid:${payload.orderId}:student`,
      metadata: { orderId: payload.orderId, paymentId: payload.paymentId },
    }),
    createAccountNotification({
      userId: payload.institute.userId,
      type: "payment",
      category: "course_order",
      priority: "high",
      title: "New student enrollment",
      message: instituteMessage,
      targetUrl: "/institute/enrollments",
      actionLabel: "Open enrollments",
      entityType: "course_order",
      entityId: payload.orderId,
      dedupeKey: `course-order-paid:${payload.orderId}:institute`,
      metadata: { orderId: payload.orderId, paymentId: payload.paymentId },
    }),
    ...payload.adminUserIds.map((adminUserId) =>
      createAccountNotification({
        userId: adminUserId,
        type: "payment",
        category: "course_order",
        priority: "normal",
        title: "Course payment captured",
        message: adminMessage,
        targetUrl: "/admin/transactions",
        actionLabel: "Open transactions",
        entityType: "course_order",
        entityId: payload.orderId,
        dedupeKey: `course-order-paid:${payload.orderId}:admin:${adminUserId}`,
        metadata: { orderId: payload.orderId, paymentId: payload.paymentId },
      })
    ),
  ]);

  const channelResults = await Promise.all([
    settleChannels([
      sendEmail(payload.student.email, "Course enrollment confirmed", studentMessage),
      sendWhatsApp(payload.student.phone, studentMessage),
      sendSms(payload.student.phone, studentMessage),
    ]),
    settleChannels([
      sendEmail(payload.institute.email, "New course enrollment", instituteMessage),
      sendWhatsApp(payload.institute.phone, instituteMessage),
      sendSms(payload.institute.phone, instituteMessage),
    ]),
  ]);

  await writeAdminAuditLog({
    adminUserId: null,
    action: "COURSE_ENROLLMENT_NOTIFICATIONS_SENT",
    targetTable: "course_orders",
    targetId: payload.orderId,
    metadata: {
      student: channelResults[0],
      institute: channelResults[1],
      orderId: payload.orderId,
      paymentId: payload.paymentId,
    },
  });
}
