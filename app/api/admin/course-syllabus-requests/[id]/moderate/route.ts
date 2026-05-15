import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Body = { action?: "approve"|"reject"|"delete"; rejectionReason?: string | null };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const { data: req, error } = await admin.data.from("course_syllabus_update_requests").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const now = new Date().toISOString();
  if (body.action === "reject") {
    const reason = String(body.rejectionReason ?? "").trim(); if (!reason) return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
    const { error: uErr } = await admin.data.from("course_syllabus_update_requests").update({ status:"rejected", rejected_by: auth.user.id, rejected_at: now, rejection_reason: reason, approved_by: null, approved_at: null }).eq("id", id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "delete") {
    const { error: uErr } = await admin.data.from("course_syllabus_update_requests").update({ status:"deleted", deleted_at: now }).eq("id", id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "approve") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { error: cErr } = await admin.data.from("courses").update({
    syllabus_text: req.proposed_syllabus_text,
    syllabus_file_path: req.proposed_file_path,
    syllabus_file_url: null,
    syllabus_file_name: req.proposed_file_name,
    syllabus_file_size_bytes: req.proposed_file_size_bytes,
    syllabus_file_mime_type: req.proposed_file_mime_type,
    syllabus_uploaded_at: req.proposed_file_path ? now : null,
    syllabus_approved_by: auth.user.id,
    syllabus_approved_at: now,
    updated_at: now,
  }).eq("id", req.course_id);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const { error: rErr } = await admin.data.from("course_syllabus_update_requests").update({ status:"approved", approved_by: auth.user.id, approved_at: now, rejection_reason: null, rejected_by: null, rejected_at: null }).eq("id", id);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
