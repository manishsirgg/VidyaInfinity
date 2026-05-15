import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { COURSE_SYLLABUS_BUCKET } from "@/lib/course-syllabus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 });

  const { data: req, error: reqError } = await admin.data
    .from("course_syllabus_update_requests")
    .select("id,proposed_file_path,proposed_file_name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; proposed_file_path: string | null; proposed_file_name: string | null }>();

  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 });
  if (!req) return NextResponse.json({ error: "Syllabus update request not found" }, { status: 404 });
  if (!req.proposed_file_path) return NextResponse.json({ error: "Proposed syllabus PDF not found" }, { status: 404 });

  const { data, error } = await admin.data.storage.from(COURSE_SYLLABUS_BUCKET).createSignedUrl(req.proposed_file_path, 60 * 10);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message ?? "Unable to sign proposed syllabus PDF" }, { status: 500 });

  return NextResponse.json({ ok: true, url: data.signedUrl, fileName: req.proposed_file_name ?? "syllabus.pdf" });
}
