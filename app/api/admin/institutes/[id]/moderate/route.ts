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

  const { data: instituteBefore, error: instituteBeforeError } = await admin.data
    .from("institutes")
    .select("id,user_id,name,status")
    .eq("id", id)
    .single<{ id: string; user_id: string; name: string; status: string }>();

  if (instituteBeforeError || !instituteBefore) {
    return NextResponse.json({ error: instituteBeforeError?.message ?? "Institute not found" }, { status: 404 });
  }

  if (instituteBefore.status !== "pending") {
    return NextResponse.json({ error: "No active pending submission for this institute" }, { status: 409 });
  }

  const [{ data: pendingInstituteDocs, error: pendingInstituteDocsError }, { data: pendingOwnerDocs, error: pendingOwnerDocsError }] =
    await Promise.all([
      admin.data.from("institute_documents").select("id").eq("institute_id", id).eq("status", "pending"),
      admin.data
        .from("user_documents")
        .select("id")
        .eq("user_id", instituteBefore.user_id)
        .eq("status", "pending")
        .eq("document_category", "identity"),
    ]);

  if (pendingInstituteDocsError) {
    return NextResponse.json({ error: pendingInstituteDocsError.message }, { status: 500 });
  }

  if (pendingOwnerDocsError) {
    return NextResponse.json({ error: pendingOwnerDocsError.message }, { status: 500 });
  }

  if (!pendingInstituteDocs?.length || !pendingOwnerDocs?.length) {
    return NextResponse.json({ error: "No active pending institute submission documents" }, { status: 409 });
  }

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
    .single<{ id: string; user_id: string; name: string; status: string; rejection_reason: string | null }>();

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

  const { error: userDocumentUpdateError } = await admin.data
    .from("user_documents")
    .update({
      status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
    .eq("user_id", result.data.user_id)
    .eq("status", "pending");

  if (userDocumentUpdateError) {
    return NextResponse.json({ error: userDocumentUpdateError.message }, { status: 500 });
  }

  const { error: instituteDocumentUpdateError } = await admin.data
    .from("institute_documents")
    .update({ status })
    .eq("institute_id", id)
    .eq("status", "pending");

  if (instituteDocumentUpdateError) {
    return NextResponse.json({ error: instituteDocumentUpdateError.message }, { status: 500 });
  }

  const { data: profile } = await admin.data
    .from("profiles")
    .select("email,phone,full_name,role")
    .eq("id", result.data.user_id)
    .single<{ email: string; phone: string | null; full_name: string | null; role: "student" | "institute" | "admin" }>();

  await createAccountNotification({
    userId: result.data.user_id,
    type: status === "approved" ? "approval" : status === "rejected" ? "rejection" : "resubmission",
    title: status === "approved" ? "Institute registration approved" : status === "rejected" ? "Institute registration rejected" : "Institute registration under review",
    message:
      status === "approved"
        ? "Your institute registration was approved."
        : status === "rejected"
          ? `Your institute registration was rejected. Reason: ${rejectionReason}.`
          : "Your institute registration is pending review.",
  });

  if (profile) {
    await sendModerationExternalNotifications({
      userId: result.data.user_id,
      role: profile.role,
      event: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "resubmitted",
      userEmail: profile.email,
      userPhone: profile.phone,
      userName: profile.full_name ?? profile.email,
      rejectionReason: status === "rejected" ? rejectionReason : null,
    });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: status === "approved" ? "INSTITUTE_APPROVED" : status === "rejected" ? "INSTITUTE_REJECTED" : "INSTITUTE_MARKED_PENDING",
    targetTable: "institutes",
    targetId: id,
    metadata: { status, rejectionReason: status === "rejected" ? rejectionReason : null, instituteName: result.data.name ?? null },
  });

  return NextResponse.json({ ok: true, institute: result.data });
}
