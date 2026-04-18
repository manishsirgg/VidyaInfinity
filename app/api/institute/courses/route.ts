import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function dateOrNull(form: FormData, key: string) {
  const raw = text(form, key);
  return raw || null;
}

function numberOrNull(form: FormData, key: string) {
  const raw = text(form, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrNull(form: FormData, key: string) {
  const raw = text(form, key).toLowerCase();
  if (!raw) return null;
  if (["true", "yes", "1"].includes(raw)) return true;
  if (["false", "no", "0"].includes(raw)) return false;
  return null;
}

function getWordCount(value: string) {
  if (!value.trim()) return 0;
  return value.trim().split(/\s+/).length;
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();

  const title = text(form, "title");
  const summary = text(form, "summary") || null;
  const description = text(form, "description") || null;
  const category = text(form, "category") || null;
  const subject = text(form, "subject") || null;
  const level = text(form, "level") || null;
  const language = text(form, "language") || null;
  const mode = text(form, "mode");
  const durationValue = numberOrNull(form, "durationValue");
  const durationUnit = text(form, "durationUnit") || null;
  const duration = text(form, "duration") || [durationValue, durationUnit].filter(Boolean).join(" ").trim();
  const schedule = text(form, "schedule") || null;
  const location = text(form, "location") || null;
  const startDate = dateOrNull(form, "startDate");
  const endDate = dateOrNull(form, "endDate");
  const admissionDeadline = dateOrNull(form, "admissionDeadline");
  const eligibility = text(form, "eligibility") || null;
  const learningOutcomes = text(form, "learningOutcomes") || null;
  const targetAudience = text(form, "targetAudience") || null;
  const certificateStatus = text(form, "certificateStatus") || null;
  const certificateDetails = text(form, "certificateDetails") || null;
  const batchSize = numberOrNull(form, "batchSize");
  const placementSupport = booleanOrNull(form, "placementSupport");
  const internshipSupport = booleanOrNull(form, "internshipSupport");
  const facultyName = text(form, "facultyName") || null;
  const facultyQualification = text(form, "facultyQualification") || null;
  const supportEmail = text(form, "supportEmail") || null;
  const supportPhone = text(form, "supportPhone") || null;
  const fees = Number(text(form, "fees"));

  if (!title || !mode || !duration || !Number.isFinite(fees) || fees < 0) {
    return NextResponse.json({ error: "title, mode, duration and valid fees are required" }, { status: 400 });
  }

  if (description && getWordCount(description) > 3000) {
    return NextResponse.json({ error: "Course details must be 3000 words or fewer" }, { status: 400 });
  }

  const { data: institute, error: instituteError } = await admin.data
    .from("institutes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course, error } = await admin.data
    .from("courses")
    .insert({
      institute_id: institute.id,
      title,
      summary,
      description,
      fees,
      duration,
      mode,
      location,
      category,
      subject,
      level,
      language,
      duration_value: durationValue,
      duration_unit: durationUnit,
      schedule,
      start_date: startDate,
      end_date: endDate,
      admission_deadline: admissionDeadline,
      eligibility,
      learning_outcomes: learningOutcomes,
      target_audience: targetAudience,
      certificate_status: certificateStatus,
      certificate_details: certificateDetails,
      batch_size: batchSize,
      placement_support: placementSupport,
      internship_support: internshipSupport,
      faculty_name: facultyName,
      faculty_qualification: facultyQualification,
      support_email: supportEmail,
      support_phone: supportPhone,
      status: "pending",
      rejection_reason: null,
      metadata: { source: "institute_create_form" },
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !course) return NextResponse.json({ error: error?.message ?? "Failed to create course" }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: null,
    action: "COURSE_SUBMITTED_BY_INSTITUTE",
    targetTable: "courses",
    targetId: course.id,
    metadata: { instituteId: institute.id, title },
  });

  return NextResponse.json({ ok: true, courseId: course.id, message: "Course submitted for admin review." });
}
