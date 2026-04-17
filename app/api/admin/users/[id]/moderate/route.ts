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

  const { data: profile, error: profileError } = await admin.data
    .from("profiles")
    .update({
      approval_status: status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
    .eq("id", id)
    .select("id,role,email,approval_status,rejection_reason")
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? "User not found" }, { status: 500 });
  }

  if (profile.role === "institute") {
    const { error: instituteError } = await admin.data
      .from("institutes")
      .update({
      status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
      .eq("user_id", id);

    if (instituteError) {
      return NextResponse.json({ error: instituteError.message }, { status: 500 });
    }
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: `USER_${status.toUpperCase()}`,
    targetTable: "profiles",
    targetId: id,
    metadata: { status, rejectionReason: rejectionReason ?? null, role: profile.role, email: profile.email },
  });

  return NextResponse.json({ ok: true, user: profile });
}
