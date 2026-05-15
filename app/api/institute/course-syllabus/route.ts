import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildSyllabusStoragePath, COURSE_SYLLABUS_ALLOWED_MIME, COURSE_SYLLABUS_BUCKET, COURSE_SYLLABUS_MAX_FILE_SIZE_BYTES, sanitizeSyllabusText, validateSyllabusPdf, validateSyllabusText } from "@/lib/course-syllabus";

export async function GET(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false }); if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const url = new URL(request.url); const courseId = url.searchParams.get("courseId")?.trim();
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  const { data: course } = await admin.data.from("courses").select("id,title,syllabus_text,syllabus_file_path,syllabus_file_name,syllabus_approved_at").eq("id", courseId).eq("institute_id", institute.id).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const { data: requests } = await admin.data.from("course_syllabus_update_requests").select("*").eq("course_id", courseId).eq("institute_id", institute.id).order("created_at", {ascending:false}).limit(20);
  return NextResponse.json({ ok: true, course, requests: requests ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false }); if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "").trim();
  const rawText = sanitizeSyllabusText(form.get("syllabusText"));
  const file = form.get("syllabusPdf");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  const textError = validateSyllabusText(rawText); if (textError) return NextResponse.json({ error: textError }, { status: 400 });
  const pdf = file instanceof File ? file : null;
  if (!rawText && !pdf) return NextResponse.json({ error: "Provide syllabus text or a syllabus PDF." }, { status: 400 });
  if (pdf) {
    const pdfError = validateSyllabusPdf({ mimeType: pdf.type || null, size: pdf.size || null });
    if (pdfError) return NextResponse.json({ error: pdfError }, { status: 400 });
    if (pdf.type !== COURSE_SYLLABUS_ALLOWED_MIME || pdf.size > COURSE_SYLLABUS_MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: "Invalid syllabus PDF." }, { status: 400 });
  }
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  const { data: course } = await admin.data.from("courses").select("id").eq("id", courseId).eq("institute_id", institute.id).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const { data: pending } = await admin.data.from("course_syllabus_update_requests").select("id").eq("course_id", courseId).eq("institute_id", institute.id).eq("status", "pending_review").is("deleted_at", null).limit(1);
  if ((pending ?? []).length > 0) return NextResponse.json({ error: "A syllabus request is already pending review for this course." }, { status: 409 });

  const { data: created, error: createError } = await admin.data.from("course_syllabus_update_requests").insert({
    course_id: courseId, institute_id: institute.id, submitted_by: auth.user.id, proposed_syllabus_text: rawText, status: "pending_review", metadata: { source: "institute_course_form" }
  }).select("id").single<{id:string}>();
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Failed to create request" }, { status: 500 });

  if (pdf) {
    const path = buildSyllabusStoragePath(institute.id, courseId, created.id);
    const up = await admin.data.storage.from(COURSE_SYLLABUS_BUCKET).upload(path, pdf, { contentType: COURSE_SYLLABUS_ALLOWED_MIME, upsert: true });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    const { error: updateError } = await admin.data.from("course_syllabus_update_requests").update({
      proposed_file_path: path, proposed_file_name: pdf.name, proposed_file_size_bytes: pdf.size, proposed_file_mime_type: pdf.type || COURSE_SYLLABUS_ALLOWED_MIME
    }).eq("id", created.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, requestId: created.id });
}
