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

  const { data, error } = await admin.data
    .from("courses")
    .update({
      approval_status: status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    })
    .eq("id", id)
    .select("id,title,approval_status,rejection_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: status === "approved" ? "COURSE_APPROVED" : status === "rejected" ? "COURSE_REJECTED" : "COURSE_MARKED_PENDING",
    targetTable: "courses",
    targetId: id,
    metadata: { status, rejectionReason: rejectionReason ?? null, title: data?.title ?? null },
  });

  return NextResponse.json({ ok: true, course: data });
}
