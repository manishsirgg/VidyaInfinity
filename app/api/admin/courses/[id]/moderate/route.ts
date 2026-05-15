import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, rejectionReason } = await request.json();

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (status === "rejected" && !String(rejectionReason ?? "").trim()) {
    return NextResponse.json({ error: "rejectionReason is required for rejected status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: existing } = await admin.data.from("courses").select("id,status,title,institute_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (existing.status !== "pending") {
    return NextResponse.json({ error: "Only pending submissions can be moderated" }, { status: 409 });
  }

  if (status === "approved") {
    const { count, error: pendingSyllabusError } = await admin.data
      .from("course_syllabus_update_requests")
      .select("id", { count: "exact", head: true })
      .eq("course_id", id)
      .is("deleted_at", null)
      .eq("status", "pending_review");

    if (pendingSyllabusError) {
      return NextResponse.json({ error: pendingSyllabusError.message }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Please approve or reject the pending syllabus request before approving this course." },
        { status: 409 },
      );
    }
  }

  const { data, error } = await admin.data
    .from("courses")
    .update({
      status,
      rejection_reason: status === "rejected" ? String(rejectionReason).trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,title,status,rejection_reason,institute_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: institute } = await admin.data
    .from("institutes")
    .select("user_id")
    .eq("id", data.institute_id)
    .maybeSingle<{ user_id: string }>();

  if (institute?.user_id) {
    await createAccountNotification({
      userId: institute.user_id,
      type: status === "approved" ? "approval" : "rejection",
      category: "moderation",
      priority: status === "rejected" ? "high" : "normal",
      title: status === "approved" ? "Course approved" : "Course rejected",
      message:
        status === "approved"
          ? `Your course \"${data.title}\" has been approved and is now live.`
          : `Your course \"${data.title}\" was rejected. Reason: ${data.rejection_reason ?? "Not specified"}`,
    }).catch(() => undefined);
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: status === "approved" ? "COURSE_APPROVED" : "COURSE_REJECTED",
    targetTable: "courses",
    targetId: id,
    metadata: { status, rejectionReason: rejectionReason ?? null, title: data?.title ?? null },
  });

  return NextResponse.json({ ok: true, course: data });
}
