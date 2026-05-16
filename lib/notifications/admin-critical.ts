import { createInAppNotification, type NotificationPriority } from "@/lib/notifications/service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AdminCriticalPayload = {
  title: string;
  message: string;
  category:
    | "payment_reconciliation"
    | "webhook_failure"
    | "refund_reconciliation"
    | "payout_review"
    | "payout_failure"
    | "system_guard"
    | "psychometric_finalization"
    | "featured_reconciliation";
  priority?: NotificationPriority;
  targetUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

export async function notifyAdminCritical(payload: AdminCriticalPayload) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    console.error("[notifications.notifyAdminCritical] admin client unavailable", { error: admin.error, category: payload.category, dedupeKey: payload.dedupeKey ?? null });
    return;
  }

  const { data: admins, error } = await admin.data.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  if (error) {
    console.error("[notifications.notifyAdminCritical] failed to resolve admins", { message: error.message, code: error.code, category: payload.category, dedupeKey: payload.dedupeKey ?? null });
    return;
  }

  const adminIds = (admins ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
  if (adminIds.length === 0) {
    console.warn("[notifications.notifyAdminCritical] no active admin recipients", { category: payload.category, dedupeKey: payload.dedupeKey ?? null });
    return;
  }

  await Promise.all(
    adminIds.map((adminId) =>
      createInAppNotification({
        userId: adminId,
        title: payload.title,
        message: payload.message,
        type: "system",
        category: payload.category,
        priority: payload.priority ?? "critical",
        targetUrl: payload.targetUrl ?? null,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        metadata: payload.metadata ?? {},
        dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${adminId}` : null,
      }).catch((insertError) => {
        console.error("[notifications.notifyAdminCritical] failed to create notification", {
          adminId,
          category: payload.category,
          dedupeKey: payload.dedupeKey ?? null,
          error: insertError instanceof Error ? insertError.message : String(insertError),
        });
      }),
    ),
  );
}
