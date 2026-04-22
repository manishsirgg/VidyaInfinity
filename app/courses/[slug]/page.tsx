import { notFound } from "next/navigation";

import { CourseMediaGallery } from "@/components/courses/course-media-gallery";
import { CoursePurchaseCard } from "@/components/courses/course-purchase-card";
import { LeadForm } from "@/components/forms/lead-form";
import { ShareActions } from "@/components/shared/share-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/constants/site";
import { isInstituteEligibleForEnrollment } from "@/lib/institutes/enrollment-eligibility";
import { createClient } from "@/lib/supabase/server";

const ENROLLMENT_STATUSES_ACTIVE = ["enrolled", "pending", "active", "suspended", "completed"] as const;
const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);

function resolveAccessEndAt(startAtIso: string | null, durationValue: number | null, durationUnit: string | null) {
  if (!startAtIso || !durationValue || durationValue <= 0) return null;
  const startAt = new Date(startAtIso);
  if (Number.isNaN(startAt.getTime())) return null;

  const normalizedUnit = String(durationUnit ?? "").trim().toLowerCase();
  const resolved = new Date(startAt);
  if (["day", "days"].includes(normalizedUnit)) resolved.setUTCDate(resolved.getUTCDate() + durationValue);
  else if (["week", "weeks"].includes(normalizedUnit)) resolved.setUTCDate(resolved.getUTCDate() + durationValue * 7);
  else if (["month", "months"].includes(normalizedUnit)) resolved.setUTCMonth(resolved.getUTCMonth() + durationValue);
  else if (["year", "years"].includes(normalizedUnit)) resolved.setUTCFullYear(resolved.getUTCFullYear() + durationValue);
  else return null;

  return resolved.toISOString();
}

export default async function CourseDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const baseSelect =
    "id,title,summary,description,fees,category,subject,level,language,mode,duration,duration_value,duration_unit,schedule,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,status,course_media(file_url,type),institute:institutes(id,status,verified,rejection_reason,is_deleted)";

  const byId = await dataClient.from("courses").select(baseSelect).eq("id", slug).eq("status", "approved").eq("is_deleted", false).maybeSingle();
  const byLegacySlug = byId.data
    ? { data: byId.data }
    : await dataClient.from("courses").select(baseSelect).eq("slug", slug).eq("status", "approved").eq("is_deleted", false).maybeSingle();

  const course = byLegacySlug.data;
  if (!course) notFound();
  const institute = Array.isArray(course.institute) ? course.institute[0] : course.institute;
  const enrollmentOpen = isInstituteEligibleForEnrollment(institute);
  const { data: featuredRow } = await dataClient.from("active_featured_courses").select("course_id").eq("course_id", course.id).maybeSingle<{ course_id: string }>();
  const isFeaturedCourse = Boolean(featuredRow?.course_id);
  const coursePath = `/courses/${slug}`;
  const shareUrl = `${siteConfig.url}${coursePath}`;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let existingActiveEnrollment = false;
  let activeEnrollmentEndsAt: string | null = null;
  if (user?.id) {
    const { data: existingEnrollmentByStudent } = await dataClient
      .from("course_enrollments")
      .select("id,access_end_at")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .in("enrollment_status", [...ENROLLMENT_STATUSES_ACTIVE])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; access_end_at: string | null }>();
    const { data: existingEnrollmentByUser } = existingEnrollmentByStudent
      ? { data: null as { id: string; access_end_at: string | null } | null }
      : await dataClient
          .from("course_enrollments")
          .select("id,access_end_at")
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .in("enrollment_status", [...ENROLLMENT_STATUSES_ACTIVE])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; access_end_at: string | null }>();
    const existingEnrollment = existingEnrollmentByStudent ?? existingEnrollmentByUser;

    if (existingEnrollment) {
      const hasActiveEnrollment = !existingEnrollment.access_end_at || new Date(existingEnrollment.access_end_at).getTime() > Date.now();
      if (hasActiveEnrollment) {
        existingActiveEnrollment = true;
        activeEnrollmentEndsAt = existingEnrollment.access_end_at ?? null;
        console.info("[courses/details] course_purchase_disabled_existing_active_enrollment", {
          event: "course_purchase_disabled_existing_active_enrollment",
          course_id: course.id,
          student_id: user.id,
          enrollment_id: existingEnrollment.id,
          access_end_at: existingEnrollment.access_end_at,
        });
      }
    }

    if (!existingActiveEnrollment) {
      const { data: paidOrderByStudent } = await dataClient
        .from("course_orders")
        .select("id,payment_status,paid_at,created_at")
        .eq("student_id", user.id)
        .eq("course_id", course.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; created_at: string | null }>();
      const { data: paidOrderByUser } = paidOrderByStudent
        ? { data: null as { id: string; payment_status: string | null; paid_at: string | null; created_at: string | null } | null }
        : await dataClient
            .from("course_orders")
            .select("id,payment_status,paid_at,created_at")
            .eq("user_id", user.id)
            .eq("course_id", course.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; created_at: string | null }>();
      const paidOrder = paidOrderByStudent ?? paidOrderByUser;

      const normalizedPaymentStatus = String(paidOrder?.payment_status ?? "").trim().toLowerCase();
      const hasConfirmedPayment = Boolean(paidOrder && (SUCCESS_PAYMENT_STATUSES.has(normalizedPaymentStatus) || paidOrder.paid_at));
      if (paidOrder && hasConfirmedPayment) {
        const fallbackEndAt = resolveAccessEndAt(
          paidOrder.paid_at ?? paidOrder.created_at ?? null,
          Number(course.duration_value ?? 0) || null,
          course.duration_unit ?? null
        );
        const hasActivePaidAccess = !fallbackEndAt || new Date(fallbackEndAt).getTime() > Date.now();
        if (hasActivePaidAccess) {
          existingActiveEnrollment = true;
          activeEnrollmentEndsAt = fallbackEndAt;
        }
      }
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-12 md:grid-cols-[2fr_1fr] md:gap-8">
      <article className="space-y-6 rounded-xl border bg-white p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{course.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {course.category ?? "General"} · {course.subject ?? "-"} · {course.level ?? "-"} · {course.language ?? "-"}
          </p>
          {isFeaturedCourse ? (
            <p className="mt-2 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Featured Course</p>
          ) : null}
          <p className="mt-3 text-slate-700">{course.summary}</p>
          <ShareActions title={course.title} text={course.summary ?? undefined} url={shareUrl} className="mt-4" />
        </div>

        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>Mode: {course.mode ?? "-"}</p>
          <p>Duration: {course.duration ?? "-"}</p>
          <p>Schedule: {course.schedule ?? "-"}</p>
          <p>Start date: {course.start_date ?? "-"}</p>
          <p>End date: {course.end_date ?? "-"}</p>
          <p>Admission deadline: {course.admission_deadline ?? "-"}</p>
          <p>Batch size: {course.batch_size ?? "-"}</p>
          <p>Faculty: {course.faculty_name ?? "-"}</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.description ?? "-"}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Eligibility</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.eligibility ?? "-"}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Learning Outcomes</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.learning_outcomes ?? "-"}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Target Audience</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.target_audience ?? "-"}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Media Gallery</h2>
          <CourseMediaGallery
            courseTitle={course.title}
            mediaItems={(course.course_media ?? []).map((media, index) => ({
              id: `${media.file_url ?? "media"}-${index}`,
              type: media.type ?? null,
              fileUrl: media.file_url ?? null,
            }))}
          />
        </section>
      </article>

      <aside className="space-y-4">
        <CoursePurchaseCard
          courseId={course.id}
          courseTitle={course.title}
          feeAmount={Number(course.fees ?? 0)}
          enrollmentOpen={enrollmentOpen}
          hasActiveEnrollment={existingActiveEnrollment}
          activeEnrollmentEndsAt={activeEnrollmentEndsAt}
        />
        <div className="rounded-xl border bg-white p-4">
          <p className="mt-2 text-sm text-slate-600">Certificate: {course.certificate_status ?? "-"}</p>
          {course.certificate_details ? <p className="mt-1 text-sm text-slate-600">{course.certificate_details}</p> : null}
          {course.faculty_qualification ? <p className="mt-2 text-sm text-slate-600">Faculty qualification: {course.faculty_qualification}</p> : null}
        </div>
        <LeadForm courseId={course.id} />
      </aside>
    </div>
  );
}
