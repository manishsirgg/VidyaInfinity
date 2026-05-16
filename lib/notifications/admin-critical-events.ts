import { notifyAdminCritical } from "@/lib/notifications/admin-critical";
import { notificationLinks } from "@/lib/notifications/links";

export async function notifyReconciliationCritical(input: {
  title: string;
  message: string;
  category: "payment_reconciliation" | "refund_reconciliation" | "featured_reconciliation" | "system_guard";
  dedupeKey: string;
  metadata: Record<string, unknown>;
  priority?: "critical" | "high";
  targetUrl?: string;
}) {
  await notifyAdminCritical({
    title: input.title,
    message: input.message,
    category: input.category,
    priority: input.priority ?? "critical",
    targetUrl: input.targetUrl ?? notificationLinks.adminDashboardUrl(),
    dedupeKey: input.dedupeKey,
    metadata: input.metadata,
  }).catch((error) => {
    console.error("[notifications/admin-critical-events] notify failed", {
      dedupeKey: input.dedupeKey,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
