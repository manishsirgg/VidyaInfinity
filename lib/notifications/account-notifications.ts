import { createInAppNotification } from "@/lib/notifications/service";

type NotificationType = "approval" | "rejection" | "resubmission" | "payment" | "lead" | "refund" | "payout" | "system";

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  category?: string;
  priority?: "low" | "normal" | "high" | "critical";
  targetUrl?: string | null;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
  expiresAt?: string | null;
  createdBy?: string | null;
};

export async function createAccountNotification(payload: NotificationPayload) {
  return createInAppNotification({
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    category: payload.category ?? payload.type,
    priority: payload.priority ?? "normal",
    targetUrl: payload.targetUrl,
    actionLabel: payload.actionLabel,
    entityType: payload.entityType,
    entityId: payload.entityId,
    metadata: payload.metadata,
    dedupeKey: payload.dedupeKey,
    expiresAt: payload.expiresAt,
    createdBy: payload.createdBy,
  });
}
