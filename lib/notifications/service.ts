import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type CreateInAppNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type: string;
  category: string;
  priority?: NotificationPriority;
  targetUrl?: string | null;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  expiresAt?: string | null;
  dedupeKey?: string | null;
};

function isMissingNotificationsTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || (message.includes("notifications") && message.includes("does not exist"));
}

export async function createInAppNotification(payload: CreateInAppNotificationInput) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { ok: false, error: admin.error } as const;

  const record = {
    user_id: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    category: payload.category,
    priority: payload.priority ?? "normal",
    target_url: payload.targetUrl ?? null,
    action_label: payload.actionLabel ?? null,
    entity_type: payload.entityType ?? null,
    entity_id: payload.entityId ?? null,
    metadata: payload.metadata ?? {},
    created_by: payload.createdBy ?? null,
    expires_at: payload.expiresAt ?? null,
    dedupe_key: payload.dedupeKey ?? null,
    is_read: false,
    read_at: null,
    dismissed_at: null,
    archived_at: null,
  };

  const query = admin.data.from("notifications").insert(record);
  const { error } = payload.dedupeKey
    ? await query.select("id").single()
    : await query;

  if (error) {
    if (isMissingNotificationsTableError(error)) {
      console.warn("[notifications.createInAppNotification] notifications table missing; skipping", {
        code: error.code,
      });
      return { ok: true, skipped: true } as const;
    }
    if (payload.dedupeKey && error.code === "23505") return { ok: true, deduped: true } as const;
    console.error("[notifications.createInAppNotification] failed to insert", {
      code: error.code,
      message: error.message,
      userId: payload.userId,
      type: payload.type,
      category: payload.category,
      dedupeKey: payload.dedupeKey ?? null,
    });
    return { ok: false, error: error.message } as const;
  }

  return { ok: true } as const;
}

export async function createInAppNotifications(payloads: CreateInAppNotificationInput[]) {
  return Promise.all(payloads.map((item) => createInAppNotification(item)));
}
