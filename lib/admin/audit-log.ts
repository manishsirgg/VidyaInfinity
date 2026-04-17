import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function writeAdminAuditLog({
  adminUserId,
  action,
  targetTable,
  targetId,
  metadata,
}: {
  adminUserId?: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  const { error } = await admin.data.from("admin_audit_logs").insert({
    admin_user_id: adminUserId ?? null,
    action,
    target_table: targetTable,
    target_id: targetId,
    metadata: metadata ?? {},
  });

  if (error) return { error: error.message };
  return { error: null };
}
