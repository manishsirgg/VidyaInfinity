import { getSupabaseAdmin } from "@/lib/supabase/admin";

type NotificationType = "approval" | "rejection" | "resubmission";

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
};

export async function createAccountNotification(payload: NotificationPayload) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return { ok: false, error: admin.error } as const;
  }

  const { error } = await admin.data.from("notifications").insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    is_read: false,
  });

  if (error) {
    return { ok: false, error: error.message } as const;
  }

  return { ok: true } as const;
}
