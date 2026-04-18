import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { sendModerationExternalNotifications } from "@/lib/integrations/account-moderation";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? "").toLowerCase();
  const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";

  if (!status || !["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (status === "rejected" && !rejectionReason) {
    return NextResponse.json({ error: "rejectionReason is required for rejected status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: existingProfile, error: profileLookupError } = await admin.data
    .from("profiles")
    .select("id,role,email,full_name,phone")
    .eq("id", id)
    .maybeSingle<{ id: string; role: "student" | "institute" | "admin"; email: string; full_name: string | null; phone: string | null }>();

  if (profileLookupError || !existingProfile) {
    return NextResponse.json({ error: profileLookupError?.message ?? "User not found" }, { status: 404 });
  }

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
    return NextResponse.json({ error: profileError?.message ?? "Unable to update profile status" }, { status: 500 });
  }

  const { error: userDocumentsError } = await admin.data
    .from("user_documents")
    .update({
      status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
    .eq("user_id", id);

  if (userDocumentsError) {
    return NextResponse.json({ error: userDocumentsError.message }, { status: 500 });
  }

  if (profile.role === "institute") {
    const { data: institute, error: instituteLookupError } = await admin.data
      .from("institutes")
      .select("id")
      .eq("user_id", id)
      .maybeSingle<{ id: string }>();

    if (instituteLookupError || !institute) {
      return NextResponse.json({ error: instituteLookupError?.message ?? "Institute not found" }, { status: 500 });
    }

    const { error: instituteError } = await admin.data
      .from("institutes")
      .update({
        status,
        verified: status === "approved",
        rejection_reason: status === "rejected" ? rejectionReason : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", id);

    if (instituteError) {
      return NextResponse.json({ error: instituteError.message }, { status: 500 });
    }

    const { error: instituteDocsError } = await admin.data.from("institute_documents").update({ status }).eq("institute_id", institute.id);
    if (instituteDocsError) {
      return NextResponse.json({ error: instituteDocsError.message }, { status: 500 });
    }
  }

  const notificationMessage =
    status === "approved"
      ? "Your registration was approved. You can now access your dashboard features."
      : status === "rejected"
        ? `Your registration was rejected. Reason: ${rejectionReason}. Please update details and resubmit.`
        : "Your registration is marked pending for further review.";

  await createAccountNotification({
    userId: profile.id,
    type: status === "approved" ? "approval" : status === "rejected" ? "rejection" : "resubmission",
    title: status === "approved" ? "Registration approved" : status === "rejected" ? "Registration rejected" : "Registration under review",
    message: notificationMessage,
  });

  await sendModerationExternalNotifications({
    userId: profile.id,
    role: profile.role,
    event: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "resubmitted",
    userEmail: existingProfile.email,
    userPhone: existingProfile.phone,
    userName: existingProfile.full_name ?? existingProfile.email,
    rejectionReason: status === "rejected" ? rejectionReason : null,
  });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: `USER_${status.toUpperCase()}`,
    targetTable: "profiles",
    targetId: id,
    metadata: { status, rejectionReason: status === "rejected" ? rejectionReason : null, role: profile.role, email: profile.email },
  });

  return NextResponse.json({ ok: true, user: profile });
}
