import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { commissionPercentage } = await request.json();
  const value = Number(commissionPercentage);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    return NextResponse.json({ error: "commissionPercentage must be between 0 and 100" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { error } = await admin.data
    .from("platform_commission_settings")
    .upsert({ key: "default", commission_percentage: value, updated_by: auth.user.id }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "COMMISSION_UPDATED",
    targetTable: "platform_commission_settings",
    targetId: "default",
    metadata: { commissionPercentage: value },
  });

  return NextResponse.json({ ok: true });
}
