import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullable(value: unknown) {
  const output = text(value);
  return output || null;
}

function numericOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrNull(value: unknown) {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (["true", "yes", "1"].includes(raw)) return true;
  if (["false", "no", "0"].includes(raw)) return false;
  return null;
}

function getWordCount(value: string) {
  if (!value.trim()) return 0;
  return value.trim().split(/\s+/).length;
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const payload = await request.json();

  const fees = numericOrNull(payload.fees);
  if (payload.fees !== undefined && (fees === null || fees < 0)) {
    return NextResponse.json({ error: "fees must be a non-negative number" }, { status: 400 });
  }

  const batchSize = numericOrNull(payload.batchSize);
  if (payload.batchSize !== undefined && (batchSize === null || !Number.isInteger(batchSize) || batchSize < 0)) {
    return NextResponse.json({ error: "batchSize must be a non-negative integer" }, { status: 400 });
  }

  if (payload.description !== undefined && payload.description !== null && getWordCount(text(payload.description)) > 3000) {
    return NextResponse.json({ error: "Course details must be 3000 words or fewer" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    title: payload.title ? text(payload.title) : undefined,
    summary: payload.summary !== undefined ? nullable(payload.summary) : undefined,
    description: payload.description !== undefined ? nullable(payload.description) : undefined,
    category: payload.category !== undefined ? nullable(payload.category) : undefined,
    subject: payload.subject !== undefined ? nullable(payload.subject) : undefined,
    level: payload.level !== undefined ? nullable(payload.level) : undefined,
    language: payload.language !== undefined ? nullable(payload.language) : undefined,
    mode: payload.mode !== undefined ? nullable(payload.mode) : undefined,
    location: payload.location !== undefined ? nullable(payload.location) : undefined,
    duration: payload.duration !== undefined ? nullable(payload.duration) : undefined,
    duration_value: payload.durationValue !== undefined ? numericOrNull(payload.durationValue) : undefined,
    duration_unit: payload.durationUnit !== undefined ? nullable(payload.durationUnit) : undefined,
    schedule: payload.schedule !== undefined ? nullable(payload.schedule) : undefined,
    start_date: payload.startDate !== undefined ? nullable(payload.startDate) : undefined,
    end_date: payload.endDate !== undefined ? nullable(payload.endDate) : undefined,
    admission_deadline: payload.admissionDeadline !== undefined ? nullable(payload.admissionDeadline) : undefined,
    eligibility: payload.eligibility !== undefined ? nullable(payload.eligibility) : undefined,
    learning_outcomes: payload.learningOutcomes !== undefined ? nullable(payload.learningOutcomes) : undefined,
    target_audience: payload.targetAudience !== undefined ? nullable(payload.targetAudience) : undefined,
    certificate_status: payload.certificateStatus !== undefined ? nullable(payload.certificateStatus) : undefined,
    certificate_details: payload.certificateDetails !== undefined ? nullable(payload.certificateDetails) : undefined,
    batch_size: payload.batchSize !== undefined ? batchSize : undefined,
    placement_support: payload.placementSupport !== undefined ? booleanOrNull(payload.placementSupport) : undefined,
    internship_support: payload.internshipSupport !== undefined ? booleanOrNull(payload.internshipSupport) : undefined,
    faculty_name: payload.facultyName !== undefined ? nullable(payload.facultyName) : undefined,
    faculty_qualification: payload.facultyQualification !== undefined ? nullable(payload.facultyQualification) : undefined,
    support_email: payload.supportEmail !== undefined ? nullable(payload.supportEmail) : undefined,
    support_phone: payload.supportPhone !== undefined ? nullable(payload.supportPhone) : undefined,
    fees: payload.fees !== undefined ? fees : undefined,
  };

  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) delete updates[key];
  }

  if (!updates.title && Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied to update" }, { status: 400 });
  }

  updates.status = "pending";
  updates.rejection_reason = null;
  updates.updated_at = new Date().toISOString();

  const { data: course, error } = await admin.data
    .from("courses")
    .update(updates)
    .eq("id", id)
    .eq("institute_id", institute.id)
    .select("id,title")
    .maybeSingle<{ id: string; title: string }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  await writeAdminAuditLog({
    adminUserId: null,
    action: "COURSE_RESUBMITTED_BY_INSTITUTE",
    targetTable: "courses",
    targetId: id,
    metadata: { instituteId: institute.id, title: course.title },
  });

  return NextResponse.json({ ok: true, message: "Course updated and submitted for approval." });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: existing } = await admin.data
    .from("courses")
    .select("id")
    .eq("id", id)
    .eq("institute_id", institute.id)
    .maybeSingle<{ id: string }>();

  if (!existing) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { count: orderCount } = await admin.data
    .from("course_orders")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id)
    .in("payment_status", ["created", "paid", "refunded"]);

  if ((orderCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "This course has payment records. It cannot be deleted and should be marked inactive instead." },
      { status: 409 }
    );
  }

  const { error } = await admin.data.from("courses").delete().eq("id", id).eq("institute_id", institute.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
