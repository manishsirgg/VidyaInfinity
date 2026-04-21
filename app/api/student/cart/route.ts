import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { isInstituteEligibleForEnrollment } from "@/lib/institutes/enrollment-eligibility";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const COURSE_ENROLLMENT_ACTIVE_STATUSES = ["pending", "active", "suspended", "completed"] as const;

function isAdmissionDeadlinePassed(admissionDeadline: string | null | undefined) {
  if (!admissionDeadline) return false;
  const normalized = admissionDeadline.trim();
  if (!normalized) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const endOfDay = new Date(`${normalized}T23:59:59.999Z`);
    if (Number.isNaN(endOfDay.getTime())) return false;
    return endOfDay.getTime() < Date.now();
  }

  const deadlineAt = new Date(normalized);
  if (Number.isNaN(deadlineAt.getTime())) return false;
  return deadlineAt.getTime() < Date.now();
}

export async function GET() {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("student_cart_items")
    .select("id,course_id,created_at,courses!inner(id,title,summary,fees,status,is_active,admission_deadline)")
    .eq("student_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId } = (await request.json().catch(() => ({}))) as { courseId?: string };
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: course, error: courseError } = await admin.data
    .from("courses")
    .select("id,status,is_active,admission_deadline,batch_size,institute:institutes!inner(id,status,verified,rejection_reason,is_deleted)")
    .eq("id", courseId)
    .eq("status", "approved")
    .eq("is_active", true)
    .maybeSingle();

  if (courseError) return NextResponse.json({ error: "Unable to validate course availability." }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course is not available" }, { status: 400 });
  const institute = Array.isArray(course.institute) ? course.institute[0] : course.institute;
  if (!isInstituteEligibleForEnrollment(institute)) {
    return NextResponse.json({ error: "This institute is not currently accepting enrollments." }, { status: 400 });
  }
  if (isAdmissionDeadlinePassed(course.admission_deadline)) {
    return NextResponse.json({ error: "Admission deadline has passed for this course." }, { status: 400 });
  }

  if (course.batch_size !== null && course.batch_size >= 0) {
    const { count: activeEnrollmentCount, error: activeEnrollmentCountError } = await admin.data
      .from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES]);

    if (activeEnrollmentCountError) {
      return NextResponse.json({ error: "Unable to validate course seat availability." }, { status: 500 });
    }

    if ((activeEnrollmentCount ?? 0) >= course.batch_size) {
      return NextResponse.json({ error: "This course batch is full and cannot be added to cart." }, { status: 400 });
    }
  }

  const { error } = await admin.data.from("student_cart_items").upsert(
    {
      student_id: auth.user.id,
      course_id: courseId,
    },
    { onConflict: "student_id,course_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId } = (await request.json().catch(() => ({}))) as { courseId?: string };
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { error } = await admin.data
    .from("student_cart_items")
    .delete()
    .eq("student_id", auth.user.id)
    .eq("course_id", courseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
