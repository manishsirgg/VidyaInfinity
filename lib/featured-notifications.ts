import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { notificationLinks } from "@/lib/notifications/links";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function notifyInstituteAndAdmins(params: {
  admin: SupabaseClient;
  instituteUserId: string;
  title: string;
  message: string;
  type?: "approval" | "rejection" | "resubmission" | "payment" | "lead" | "refund" | "payout" | "system";
  metadata?: Record<string, unknown>;
}) {
  const { data: admins } = await params.admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = (admins ?? []).map((item) => item.id).filter((value): value is string => typeof value === "string" && value.length > 0);
  const recipientIds = Array.from(new Set([params.instituteUserId, ...adminIds]));

  await Promise.all(
    recipientIds.map((userId) =>
      createAccountNotification({
        userId,
        type: params.type ?? "payment",
        title: params.title,
        message: params.message,
        targetUrl:
          userId === params.instituteUserId
            ? notificationLinks.instituteFeaturedUrl()
            : notificationLinks.adminFeaturedReconciliationUrl(),
        metadata: params.metadata,
      }).catch(() => undefined),
    ),
  );
}
