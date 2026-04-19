import { notFound } from "next/navigation";

import { CourseMediaGallery } from "@/components/courses/course-media-gallery";
import { CoursePurchaseCard } from "@/components/courses/course-purchase-card";
import { LeadForm } from "@/components/forms/lead-form";
import { ShareActions } from "@/components/shared/share-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/constants/site";
import { createClient } from "@/lib/supabase/server";

export default async function CourseDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const baseSelect = "id,title,summary,description,fees,category,subject,level,language,mode,duration,duration_value,duration_unit,schedule,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,status,course_media(file_url,type)";

  const byId = await dataClient.from("courses").select(baseSelect).eq("id", slug).eq("status", "approved").maybeSingle();
  const byLegacySlug = byId.data
    ? { data: byId.data }
    : await dataClient.from("courses").select(baseSelect).eq("slug", slug).eq("status", "approved").maybeSingle();

  const course = byLegacySlug.data;
  if (!course) notFound();
  const coursePath = `/courses/${slug}`;
  const shareUrl = `${siteConfig.url}${coursePath}`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-12 md:grid-cols-[2fr_1fr] md:gap-8">
      <article className="space-y-6 rounded-xl border bg-white p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{course.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {course.category ?? "General"} · {course.subject ?? "-"} · {course.level ?? "-"} · {course.language ?? "-"}
          </p>
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
        <CoursePurchaseCard courseId={course.id} courseTitle={course.title} feeAmount={Number(course.fees ?? 0)} />
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
