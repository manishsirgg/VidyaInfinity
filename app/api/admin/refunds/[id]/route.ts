import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, adminNote } = await request.json();

  if (!["requested", "approved", "rejected", "processed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: refund, error } = await admin.data
    .from("refunds")
    .update({
      status,
      admin_note: adminNote ?? null,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,status,course_order_id,psychometric_order_id")
    .single();

  if (error || !refund) return NextResponse.json({ error: error?.message ?? "Refund not found" }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "REFUND_STATUS_UPDATED",
    targetTable: "refunds",
    targetId: refund.id,
    metadata: { status, courseOrderId: refund.course_order_id, psychometricOrderId: refund.psychometric_order_id },
  });

  return NextResponse.json({ ok: true, refund });
}
