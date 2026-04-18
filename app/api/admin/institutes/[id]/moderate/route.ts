import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, rejectionReason } = await request.json();

  if (!["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (status === "rejected" && !rejectionReason) {
    return NextResponse.json({ error: "rejectionReason is required for rejected status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const result = await admin.data
    .from("institutes")
    .update({
      status,
      verified: status === "approved",
      rejection_reason: status === "rejected" ? rejectionReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,user_id,name,status,rejection_reason")
    .single();

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error?.message ?? "Institute not found" }, { status: 500 });
  }

  const { error: profileUpdateError } = await admin.data
    .from("profiles")
    .update({
      approval_status: status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
    .eq("id", result.data.user_id);

  if (profileUpdateError) {
    return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: status === "approved" ? "INSTITUTE_APPROVED" : status === "rejected" ? "INSTITUTE_REJECTED" : "INSTITUTE_MARKED_PENDING",
    targetTable: "institutes",
    targetId: id,
    metadata: { status, rejectionReason: rejectionReason ?? null, instituteName: result.data.name ?? null },
  });

  return NextResponse.json({ ok: true, institute: result.data });
}
