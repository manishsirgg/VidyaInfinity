import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function writeAdminAuditLog({
  adminUserId,
  actorUserId,
  action,
  targetTable,
  targetId,
  description,
  oldData,
  metadata,
}: {
  adminUserId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  description?: string;
  oldData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  const { error } = await admin.data.from("admin_audit_logs").insert({
    admin_user_id: adminUserId ?? actorUserId ?? null,
    actor_user_id: actorUserId ?? adminUserId ?? null,
    action,
    target_table: targetTable,
    target_id: targetId,
    description: description ?? null,
    old_data: oldData ?? null,
    metadata: metadata ?? {},
  });

  if (error) return { error: error.message };
  return { error: null };
}
