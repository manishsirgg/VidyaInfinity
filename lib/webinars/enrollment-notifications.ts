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

  const dedupeTargets = [payload.studentId, instituteUserId, ...adminIds].filter((value): value is string => Boolean(value));
  if (dedupeTargets.length > 0) {
    const { data: existing } = await payload.supabase
      .from("notifications")
      .select("id,user_id")
      .in("user_id", dedupeTargets)
      .eq("type", "approval")
      .eq("title", "Webinar enrollment confirmed")
      .like("message", `%Enrollment:${payload.webinarId}%`);

    if ((existing ?? []).length > 0) return;
  }

  await Promise.allSettled([
    createAccountNotification({
      userId: payload.studentId,
      type: "approval",
      title: "Webinar enrollment confirmed",
      message: `You are successfully enrolled in ${payload.webinarTitle} (${modeLabel}). Enrollment:${payload.webinarId}`,
    }),
    ...(instituteUserId
      ? [
          createAccountNotification({
            userId: instituteUserId,
            type: "approval",
            title: "New webinar enrollment",
            message: `${studentName} enrolled in your webinar ${payload.webinarTitle}. Enrollment:${payload.webinarId}`,
          }),
        ]
      : []),
    ...adminIds.map((adminId) =>
      createAccountNotification({
        userId: adminId,
        type: "approval",
        title: "Webinar enrollment confirmed",
        message: `New webinar enrollment in ${payload.webinarTitle}. Institute: ${instituteName}. Student: ${studentName}. Enrollment:${payload.webinarId}`,
      }),
    ),
  ]);
}
