import { getSupabaseAdmin } from "@/lib/supabase/admin";

type NotificationType = "approval" | "rejection" | "resubmission";

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
};

function isMissingNotificationsTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || (message.includes("notifications") && message.includes("does not exist"));
}

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
    if (isMissingNotificationsTableError(error)) {
      return { ok: true, skipped: true } as const;
    }

    return { ok: false, error: error.message } as const;
  }

  return { ok: true } as const;
}
