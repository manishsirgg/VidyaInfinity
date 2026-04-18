import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function numberOrNull(form: FormData, key: string) {
  const raw = text(form, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();

  const title = text(form, "title");
  const summary = text(form, "summary");
  const description = text(form, "description");
  const feeAmount = Number(text(form, "feeAmount"));
  const category = text(form, "category");
  const subcategory = text(form, "subcategory");
  const courseLevel = text(form, "courseLevel");
  const language = text(form, "language");
  const deliveryMode = text(form, "deliveryMode");
  const durationValue = numberOrNull(form, "durationValue");
  const durationUnit = text(form, "durationUnit");
  const weeklySchedule = text(form, "weeklySchedule");
  const startDate = text(form, "startDate");
  const endDate = text(form, "endDate");
  const eligibility = text(form, "eligibility");
  const prerequisites = text(form, "prerequisites");
  const learningOutcomes = text(form, "learningOutcomes");
  const targetAudience = text(form, "targetAudience");
  const syllabus = text(form, "syllabus");
  const certificateAvailable = text(form, "certificateAvailable") === "yes";
  const certificationDetails = text(form, "certificationDetails");
  const totalSeats = numberOrNull(form, "totalSeats");
  const admissionDeadline = text(form, "admissionDeadline");
  const supportEmail = text(form, "supportEmail");
  const supportPhone = text(form, "supportPhone");
  const instructorName = text(form, "instructorName");
  const instructorQualification = text(form, "instructorQualification");
  const demoVideoUrl = text(form, "demoVideoUrl");
  const brochureUrl = text(form, "brochureUrl");

  if (!title || !summary || !description || !feeAmount || !category || !courseLevel || !language || !deliveryMode) {
    return NextResponse.json(
      { error: "title, summary, description, feeAmount, category, courseLevel, language and deliveryMode are required" },
      { status: 400 }
    );
  }

  if (!durationValue || !durationUnit || !weeklySchedule || !startDate || !eligibility || !learningOutcomes || !syllabus) {
    return NextResponse.json(
      {
        error:
          "durationValue, durationUnit, weeklySchedule, startDate, eligibility, learningOutcomes and syllabus are required",
      },
      { status: 400 }
    );
  }

  const { data: institute } = await admin.data
    .from("institutes")
    .select("id,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  if (institute.status !== "approved") {
    return NextResponse.json({ error: "Institute approval is pending. Courses can be listed only after admin approval." }, { status: 403 });
  }

  const { data: course, error } = await admin.data
    .from("courses")
    .insert({
      institute_id: institute.id,
      title,
      slug: `${toSlug(title)}-${crypto.randomUUID().slice(0, 8)}`,
      summary,
      description,
      fee_amount: feeAmount,
      category,
      subcategory: subcategory || null,
      course_level: courseLevel,
      language,
      delivery_mode: deliveryMode,
      duration_value: durationValue,
      duration_unit: durationUnit,
      weekly_schedule: weeklySchedule,
      start_date: startDate,
      end_date: endDate || null,
      eligibility,
      prerequisites: prerequisites || null,
      learning_outcomes: learningOutcomes,
      target_audience: targetAudience || null,
      syllabus,
      certificate_available: certificateAvailable,
      certification_details: certificationDetails || null,
      total_seats: totalSeats,
      admission_deadline: admissionDeadline || null,
      support_email: supportEmail || null,
      support_phone: supportPhone || null,
      instructor_name: instructorName || null,
      instructor_qualification: instructorQualification || null,
      demo_video_url: demoVideoUrl || null,
      brochure_url: brochureUrl || null,
      approval_status: "pending",
      rejection_reason: null,
    })
    .select("id")
    .single();

  if (error || !course) return NextResponse.json({ error: error?.message ?? "Failed to create course" }, { status: 500 });

  return NextResponse.json({ ok: true, courseId: course.id, message: "Course created. Uploading media now." });
}
