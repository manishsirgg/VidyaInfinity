import { createAccountNotification } from "@/lib/notifications/account-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

type EnrollmentNotificationPayload = {
  supabase: SupabaseClient;
  webinarId: string;
  webinarTitle: string;
  studentId: string;
  instituteId: string;
  mode: "free" | "paid";
};

export async function notifyWebinarEnrollment(payload: EnrollmentNotificationPayload) {
  const [{ data: institute }, { data: student }, { data: adminProfiles }] = await Promise.all([
    payload.supabase.from("institutes").select("user_id,name").eq("id", payload.instituteId).maybeSingle<{ user_id: string; name: string | null }>(),
    payload.supabase.from("profiles").select("id,full_name,email").eq("id", payload.studentId).maybeSingle<{ id: string; full_name: string | null; email: string | null }>(),
    payload.supabase.from("profiles").select("id").eq("role", "admin"),
  ]);

  const studentName = student?.full_name ?? student?.email ?? "Student";
  const modeLabel = payload.mode === "paid" ? "paid" : "free";
  const instituteName = institute?.name ?? "Institute";

  const instituteUserId = institute?.user_id;
  const adminIds = (adminProfiles ?? []).map((admin) => admin.id);

  const enrollmentToken = `Enrollment:${payload.webinarId}:${payload.studentId}`;
  const recipients: Array<{ userId: string; title: string; message: string; targetUrl: string; dedupeSuffix: string }> = [
    {
      userId: payload.studentId,
      title: "Webinar enrollment confirmed",
      message: `You are successfully enrolled in ${payload.webinarTitle} (${modeLabel}). ${enrollmentToken}`,
      targetUrl: "/student/purchases",
      dedupeSuffix: "student",
    },
    ...(instituteUserId
      ? [
          {
            userId: instituteUserId,
            title: "New webinar enrollment",
            message: `${studentName} enrolled in your webinar ${payload.webinarTitle}. ${enrollmentToken}`,
            targetUrl: "/institute/webinars",
            dedupeSuffix: "institute",
          },
        ]
      : []),
    ...adminIds.map((adminId) => ({
      userId: adminId,
      title: "Webinar enrollment confirmed",
      message: `New webinar enrollment in ${payload.webinarTitle}. Institute: ${instituteName}. Student: ${studentName}. ${enrollmentToken}`,
      targetUrl: "/admin/transactions",
      dedupeSuffix: `admin:${adminId}`,
    })),
  ];

  const targetIds = [...new Set(recipients.map((item) => item.userId))];
  const { data: existing } = targetIds.length
    ? await payload.supabase
        .from("notifications")
        .select("user_id,message")
        .in("user_id", targetIds)
        .eq("type", "approval")
        .like("message", `%${enrollmentToken}%`)
    : { data: [] as Array<{ user_id: string | null; message: string | null }> };

  const existingByUserId = new Set((existing ?? []).map((row) => row.user_id).filter((value): value is string => Boolean(value)));
  const pendingCreates = recipients.filter((item) => !existingByUserId.has(item.userId));

  await Promise.allSettled(
    pendingCreates.map((item) =>
      createAccountNotification({
        userId: item.userId,
        type: "payment",
        category: "webinar_order",
        priority: "high",
        title: item.title,
        message: item.message,
        targetUrl: item.targetUrl,
        actionLabel: "Open",
        entityType: "webinar",
        entityId: payload.webinarId,
        dedupeKey: `webinar-enrollment:${payload.webinarId}:${payload.studentId}:${item.dedupeSuffix}`,
      }),
    ),
  );
}
