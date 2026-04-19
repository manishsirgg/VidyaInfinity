import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as { status?: "approved" | "rejected"; rejectionReason?: string };

  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (body.status === "rejected" && !String(body.rejectionReason ?? "").trim()) {
    return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,institute_id,approval_status")
    .eq("id", id)
    .maybeSingle<{ id: string; title: string; institute_id: string; approval_status: string | null }>();

  if (!webinar) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  const { data: updated, error } = await admin.data
    .from("webinars")
    .update({
      approval_status: body.status,
      rejection_reason: body.status === "rejected" ? String(body.rejectionReason).trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,title,institute_id,approval_status,rejection_reason")
    .single<{ id: string; title: string; institute_id: string; approval_status: string; rejection_reason: string | null }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: institute } = await admin.data
    .from("institutes")
    .select("user_id")
    .eq("id", webinar.institute_id)
    .maybeSingle<{ user_id: string }>();

  if (institute?.user_id) {
    await createAccountNotification({
      userId: institute.user_id,
      type: body.status === "approved" ? "approval" : "rejection",
      title: body.status === "approved" ? "Webinar approved" : "Webinar rejected",
      message:
        body.status === "approved"
          ? `Your webinar \"${updated.title}\" has been approved and is now discoverable.`
          : `Your webinar \"${updated.title}\" was rejected. Reason: ${updated.rejection_reason ?? "Not specified"}`,
    }).catch(() => undefined);
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: body.status === "approved" ? "WEBINAR_APPROVED" : "WEBINAR_REJECTED",
    targetTable: "webinars",
    targetId: id,
    metadata: { status: body.status, rejectionReason: body.rejectionReason ?? null },
  });

  return NextResponse.json({ ok: true, webinar: updated });
}
