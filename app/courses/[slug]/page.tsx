import { notFound } from "next/navigation";

import { LeadForm } from "@/components/forms/lead-form";
import { createClient } from "@/lib/supabase/server";

export default async function CourseDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select(
      "id,title,summary,description,fee_amount,category,subcategory,course_level,language,delivery_mode,duration_value,duration_unit,weekly_schedule,start_date,end_date,eligibility,prerequisites,learning_outcomes,target_audience,syllabus,certificate_available,certification_details,total_seats,admission_deadline,support_email,support_phone,instructor_name,instructor_qualification,demo_video_url,brochure_url,approval_status,course_media(file_url,type)"
    )
    .eq("slug", slug)
    .eq("approval_status", "approved")
    .single();

  if (!course) notFound();

  const imageMedia = course.course_media?.filter((media) => media.type === "image") ?? [];
  const videoMedia = course.course_media?.filter((media) => media.type === "video") ?? [];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-12 md:grid-cols-[2fr_1fr] md:gap-8">
      <article className="space-y-6 rounded-xl border bg-white p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{course.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {course.category ?? "General"} {course.subcategory ? `· ${course.subcategory}` : ""} · {course.course_level ?? "-"} · {course.language ?? "-"}
          </p>
          <p className="mt-3 text-slate-700">{course.summary}</p>
        </div>

        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>Delivery mode: {course.delivery_mode ?? "-"}</p>
          <p>
            Duration: {course.duration_value ?? "-"} {course.duration_unit ?? ""}
          </p>
          <p>Weekly schedule: {course.weekly_schedule ?? "-"}</p>
          <p>Start date: {course.start_date ?? "-"}</p>
          <p>End date: {course.end_date ?? "-"}</p>
          <p>Admission deadline: {course.admission_deadline ?? "-"}</p>
          <p>Total seats: {course.total_seats ?? "-"}</p>
          <p>Instructor: {course.instructor_name ?? "-"}</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.description}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Eligibility & Prerequisites</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">Eligibility: {course.eligibility ?? "-"}</p>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">Prerequisites: {course.prerequisites ?? "-"}</p>
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
          <h2 className="text-lg font-semibold">Syllabus</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{course.syllabus ?? "-"}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Media Gallery</h2>
          {imageMedia.length > 0 ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {imageMedia.map((media) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={media.file_url} src={media.file_url} alt={course.title} className="h-48 w-full rounded-md object-cover" />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No image gallery uploaded.</p>
          )}
          {videoMedia.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {videoMedia.map((media) => (
                <video key={media.file_url} controls className="w-full rounded-md border" src={media.file_url} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No video media uploaded.</p>
          )}
        </section>
      </article>

      <aside className="space-y-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-600">Course Fee</p>
          <p className="text-2xl font-semibold">₹{course.fee_amount}</p>
          <p className="mt-2 text-sm text-slate-600">
            Certificate: {course.certificate_available ? `Yes${course.certification_details ? ` (${course.certification_details})` : ""}` : "No"}
          </p>
          <p className="mt-2 text-sm text-slate-600">Support email: {course.support_email ?? "-"}</p>
          <p className="text-sm text-slate-600">Support phone: {course.support_phone ?? "-"}</p>
          {course.instructor_qualification ? <p className="mt-2 text-sm text-slate-600">Instructor qualification: {course.instructor_qualification}</p> : null}
          {course.demo_video_url ? (
            <a href={course.demo_video_url} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-brand-600 underline">
              Watch demo video
            </a>
          ) : null}
          {course.brochure_url ? (
            <a href={course.brochure_url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-brand-600 underline">
              Open brochure
            </a>
          ) : null}
        </div>
        <LeadForm courseId={course.id} />
      </aside>
    </div>
  );
}
