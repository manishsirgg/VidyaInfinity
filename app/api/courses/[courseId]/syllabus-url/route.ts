import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { COURSE_SYLLABUS_BUCKET } from "@/lib/course-syllabus";

export async function GET(_: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: course } = await admin.data.from("courses").select("id,syllabus_file_path,status,is_deleted").eq("id", courseId).eq("status", "approved").eq("is_deleted", false).maybeSingle();
  if (!course?.syllabus_file_path) return NextResponse.json({ error: "Syllabus file not found" }, { status: 404 });
  const { data, error } = await admin.data.storage.from(COURSE_SYLLABUS_BUCKET).createSignedUrl(course.syllabus_file_path, 60 * 10);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message ?? "Unable to sign syllabus file" }, { status: 500 });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
