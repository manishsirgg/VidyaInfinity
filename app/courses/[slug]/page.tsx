import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Clock3, GraduationCap, Images, Languages, MonitorPlay } from "lucide-react";
import { makeShareMetadata, resolveShareImage } from "@/lib/seo/share-metadata";
import { notFound } from "next/navigation";

import { CourseMediaGallery } from "@/components/courses/course-media-gallery";
import { CoursePurchaseCard } from "@/components/courses/course-purchase-card";
import { CourseSyllabusSection } from "@/components/courses/course-syllabus-section";
import { LeadForm } from "@/components/forms/lead-form";
import { ShareActions } from "@/components/shared/share-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/constants/site";
import { isInstituteEligibleForEnrollment } from "@/lib/institutes/enrollment-eligibility";
import { createClient } from "@/lib/supabase/server";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { isCourseEnrollmentCurrentlyActive, normalizeEntitlementStatus } from "@/lib/payments/entitlement-status";


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


// Fetch metadata separately from the interactive course page, with no auth/session dependency.
// Only published courses should expose course-specific previews to social crawlers.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fallback = makeShareMetadata({
    title: "Courses | Vidya Infinity",
    description: "Explore courses and professional training at Vidya Infinity.",
    path: `/courses/${encodeURIComponent(slug)}`,
  });
  const admin = getSupabaseAdmin();
  if (!admin.ok) return fallback;

  const courseSelect = "id,title,summary,description,course_media(file_url,type)";
  const { data: byId } = await admin.data
    .from("courses")
    .select(courseSelect)
    .eq("id", slug)
    .eq("status", "approved")
    .eq("is_deleted", false)
    .eq("is_active", true)
    .maybeSingle();
  // Legacy slug links are still supported where the optional slug column exists.
  const bySlug = byId ? null : await admin.data
    .from("courses")
    .select(courseSelect)
    .eq("slug", slug)
    .eq("status", "approved")
    .eq("is_deleted", false)
    .eq("is_active", true)
    .maybeSingle();
  const course = byId ?? bySlug?.data;
  if (!course) return fallback;

  const cover = course.course_media?.find((item) => item.type === "image" && item.file_url)?.file_url ?? null;
  return makeShareMetadata({
    title: `${course.title} | Vidya Infinity`,
    description: course.summary || course.description || "View course details and admission information on Vidya Infinity.",
    path: `/courses/${encodeURIComponent(slug)}`,
    image: resolveShareImage(cover, "course-media"),
  });
}

export default async function CourseDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const baseSelect =
    "id,title,summary,description,fees,category,subject,level,language,mode,duration,duration_value,duration_unit,schedule,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,status,syllabus_text,syllabus_file_path,course_media(file_url,type),institute:institutes(id,status,verified,rejection_reason,is_deleted)";

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
  let hadExpiredEnrollment = false;
  let activeEnrollmentEndsAt: string | null = null;
  if (user?.id) {
    const { data: existingEnrollmentsByStudent } = await dataClient
      .from("course_enrollments")
      .select("id,access_end_at,enrollment_status,created_at")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: existingEnrollmentsByUser } = (existingEnrollmentsByStudent ?? []).length > 0
      ? { data: null as { id: string; access_end_at: string | null; enrollment_status: string | null; created_at: string | null }[] | null }
      : await dataClient
          .from("course_enrollments")
          .select("id,access_end_at,enrollment_status,created_at")
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .order("created_at", { ascending: false })
          .limit(20);
    const mergedEnrollments = [...(existingEnrollmentsByStudent ?? []), ...(existingEnrollmentsByUser ?? [])];
    const existingEnrollment =
      mergedEnrollments.find((row) =>
        isCourseEnrollmentCurrentlyActive({ enrollmentStatus: row.enrollment_status, paymentStatus: null, accessEndAt: row.access_end_at })
      ) ?? null;

    hadExpiredEnrollment = mergedEnrollments.some((row) => Boolean(row.access_end_at) && new Date(row.access_end_at as string).getTime() <= Date.now());

    if (existingEnrollment) {
      const effectiveEnrollmentEndAt = existingEnrollment.access_end_at ?? null;
      const hasActiveEnrollment = !effectiveEnrollmentEndAt || new Date(effectiveEnrollmentEndAt).getTime() > Date.now();
      if (hasActiveEnrollment) {
        existingActiveEnrollment = true;
        activeEnrollmentEndsAt = effectiveEnrollmentEndAt ?? null;
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

      const normalizedPaymentStatus = normalizeEntitlementStatus(paidOrder?.payment_status ?? "");
      const hasConfirmedPayment = Boolean(paidOrder && (isSuccessfulPaymentStatus(normalizedPaymentStatus) || paidOrder.paid_at));
      if (paidOrder && hasConfirmedPayment) {
        const fallbackEndAt = resolveAccessEndAt(
          paidOrder.paid_at ?? paidOrder.created_at ?? null,
          Number(course.duration_value ?? 0) || null,
          course.duration_unit ?? null
        );
        const effectivePaidEndAt = fallbackEndAt;
        const hasActivePaidAccess = isCourseEnrollmentCurrentlyActive({
          enrollmentStatus: "enrolled",
          paymentStatus: normalizedPaymentStatus,
          accessEndAt: effectivePaidEndAt,
        });
        if (hasActivePaidAccess) {
          existingActiveEnrollment = true;
          activeEnrollmentEndsAt = effectivePaidEndAt;
        } else {
          hadExpiredEnrollment = true;
        }
      }
    }
  }

  const summary = course.summary?.trim();
  const description = course.description?.trim();
  const intro = summary || (description && description.length <= 240 ? description : undefined);
  const topics = [course.category, course.subject, course.level]
    .map((topic) => topic?.trim())
    .filter((topic, index, values): topic is string => Boolean(topic) && values.indexOf(topic) === index);
  const highlights = [
    { label: "Duration", value: course.duration, Icon: Clock3 },
    { label: "Format", value: course.mode, Icon: MonitorPlay },
    { label: "Language", value: course.language, Icon: Languages },
  ].filter(({ value }) => value?.trim());
  const batchDetails = [
    { label: "Schedule", value: course.schedule },
    { label: "Start date", value: course.start_date },
    { label: "End date", value: course.end_date },
    { label: "Admission deadline", value: course.admission_deadline },
    { label: "Batch size", value: course.batch_size },
  ].filter(({ value }) => value != null && String(value).trim());
  const mediaItems = (course.course_media ?? []).flatMap((media, index) => {
    const fileUrl = media.file_url?.trim();
    if (!fileUrl) return [];
    return [{
      id: `${fileUrl}-${index}`,
      type: media.type,
      fileUrl: /^https?:\/\//i.test(fileUrl) ? fileUrl : resolveShareImage(fileUrl, "course-media") ?? fileUrl,
    }];
  });
  const cover = mediaItems.find((item) => item.type?.toLowerCase() === "image" && /^https?:\/\//i.test(item.fileUrl));
  const hasSyllabus = Boolean(course.syllabus_text?.trim() || course.syllabus_file_path);
  const hasOverview = Boolean(description && description !== intro);
  const hasLearningDetails = Boolean(course.learning_outcomes?.trim() || course.eligibility?.trim() || course.target_audience?.trim());
  const hasFaculty = Boolean(course.faculty_name?.trim() || course.faculty_qualification?.trim());
  const hasCertificate = Boolean(course.certificate_status?.trim() || course.certificate_details?.trim());
  const navigation = [
    { id: "overview", label: "Overview", show: hasOverview },
    { id: "learning", label: "Learning & eligibility", show: hasLearningDetails },
    { id: "syllabus", label: "Syllabus", show: hasSyllabus },
    { id: "schedule", label: "Schedule", show: batchDetails.length > 0 },
    { id: "gallery", label: "Gallery", show: mediaItems.length > 0 },
    { id: "course-inquiry", label: "Ask a question", show: true },
  ].filter(({ show }) => show);

  return (
    <div data-course-landing>
      <header className="bg-[radial-gradient(ellipse_at_top_right,_#174c78,_#072842_68%)] text-white">
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8">
          <Link href="/courses" className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-sky-100 hover:text-white hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All courses
          </Link>
          <div className={`mt-5 grid items-center gap-6 sm:mt-6 lg:gap-12 ${cover ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]" : ""}`}>
            <div className="min-w-0">
              {topics.length || isFeaturedCourse ? (
                <ul className="mb-4 flex flex-wrap gap-2 text-xs font-medium sm:text-sm">
                  {isFeaturedCourse ? <li className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Featured course</li> : null}
                  {topics.map((topic) => <li key={topic} className="max-w-full break-words rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sky-50">{topic}</li>)}
                </ul>
              ) : null}
              <h1 className="max-w-4xl break-words text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-6xl">{course.title}</h1>
              {intro ? <p className="mt-4 max-w-2xl whitespace-pre-line break-words text-base leading-7 text-sky-50 sm:text-lg">{intro}</p> : null}
              {highlights.length ? (
                <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-4 border-t border-white/20 pt-5">
                  {highlights.map(({ label, value, Icon }) => (
                    <div className="flex max-w-full items-start gap-2.5" key={label}>
                      <Icon className="mt-0.5 size-5 shrink-0 text-sky-200" aria-hidden="true" />
                      <div className="min-w-0">
                        <dt className="text-xs text-sky-200">{label}</dt>
                        <dd className="break-words text-sm font-medium text-white">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              ) : null}
              <a href="#course-enrollment" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-900 transition hover:bg-sky-100">
                {existingActiveEnrollment || !enrollmentOpen ? "View enrollment details" : "See fees & enroll"}
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
            {cover ? (
              <a href="#gallery" aria-label="View course media" className="relative block aspect-[16/10] overflow-hidden rounded-2xl border border-white/25 bg-brand-900 shadow-xl transition hover:border-white/70">
                <Image
                  src={cover.fileUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="object-cover"
                  unoptimized
                  priority
                />
                <span className="absolute bottom-3 right-3 rounded-lg bg-slate-950/80 p-2 text-white">
                  <Images className="size-4" aria-hidden="true" />
                </span>
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <nav aria-label="Course sections" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm font-medium text-slate-700 sm:px-6 lg:gap-x-7 lg:px-8">
          {navigation.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-10 items-center rounded-sm hover:text-brand-700 hover:underline hover:underline-offset-4">{label}</a>
          ))}
        </nav>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-7 px-4 py-7 sm:px-6 sm:py-9 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-9 lg:px-8">
        <aside aria-label="Course enrollment" className="min-w-0 lg:col-start-2 lg:row-start-1">
          <div id="course-enrollment" className="scroll-mt-32 lg:sticky lg:top-24">
            <CoursePurchaseCard
              courseId={course.id}
              courseTitle={course.title}
              feeAmount={Number(course.fees ?? 0)}
              enrollmentOpen={enrollmentOpen}
              hasActiveEnrollment={existingActiveEnrollment}
              hasExpiredEnrollment={!existingActiveEnrollment && hadExpiredEnrollment}
              activeEnrollmentEndsAt={activeEnrollmentEndsAt}
            />
          </div>
        </aside>

        <article className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          {hasOverview ? (
            <CourseSection id="overview" title="About this course">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 sm:text-base">{description}</p>
            </CourseSection>
          ) : null}

          {hasLearningDetails ? (
            <CourseSection id="learning" title="Learning & eligibility">
              <div className="space-y-5">
                {[
                  { title: "What you’ll learn", text: course.learning_outcomes },
                  { title: "Who this course is for", text: course.target_audience },
                  { title: "Eligibility requirements", text: course.eligibility },
                ].filter(({ text }) => text?.trim()).map(({ title, text }) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">{title}</h3>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CourseSection>
          ) : null}

          {hasSyllabus ? (
            <CourseSection id="syllabus" title="Course syllabus" icon={<BookOpen className="size-5" aria-hidden="true" />}>
              <CourseSyllabusSection courseId={course.id} text={course.syllabus_text?.trim() || null} hasFile={Boolean(course.syllabus_file_path)} />
            </CourseSection>
          ) : null}

          {batchDetails.length ? (
            <CourseSection id="schedule" title="Batch schedule" icon={<CalendarDays className="size-5" aria-hidden="true" />}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {batchDetails.map(({ label, value }) => (
                  <div key={label} className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
                    <dt className="text-xs font-medium text-slate-600">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-slate-600">Contact the institute for the latest batch timing.</p>
            </CourseSection>
          ) : null}

          {hasFaculty || hasCertificate ? (
            <CourseSection title="Faculty & certification" icon={<GraduationCap className="size-5" aria-hidden="true" />}>
              <dl className="grid gap-5 text-sm text-slate-700 sm:grid-cols-2">
                {hasFaculty ? (
                  <div className="min-w-0">
                    <dt className="font-semibold text-slate-900">Faculty</dt>
                    {course.faculty_name ? <dd className="mt-1 break-words">{course.faculty_name}</dd> : null}
                    {course.faculty_qualification ? <dd className="mt-1 whitespace-pre-wrap break-words">{course.faculty_qualification}</dd> : null}
                  </div>
                ) : null}
                {hasCertificate ? (
                  <div className="min-w-0">
                    <dt className="font-semibold text-slate-900">Certificate</dt>
                    {course.certificate_status ? <dd className="mt-1 break-words">{course.certificate_status}</dd> : null}
                    {course.certificate_details ? <dd className="mt-1 whitespace-pre-wrap break-words">{course.certificate_details}</dd> : null}
                  </div>
                ) : null}
              </dl>
            </CourseSection>
          ) : null}

          {mediaItems.length ? (
            <CourseSection id="gallery" title="Course gallery" icon={<Images className="size-5" aria-hidden="true" />}>
              <CourseMediaGallery courseTitle={course.title} mediaItems={mediaItems} />
            </CourseSection>
          ) : null}

          <section id="course-inquiry" aria-labelledby="course-inquiry-heading" className="scroll-mt-32 rounded-2xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-100 sm:p-6">
            <h2 id="course-inquiry-heading" className="mb-4 text-xl font-semibold sm:text-2xl">Ask about this course</h2>
            <LeadForm courseId={course.id} instituteId={institute?.id} />
          </section>
          <ShareActions title={course.title} text={summary || undefined} url={shareUrl} className="px-1 pt-1" />
        </article>
      </div>
    </div>
  );
}

function CourseSection({ id, title, icon, children }: { id?: string; title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        {icon ? <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</span> : null}
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}
