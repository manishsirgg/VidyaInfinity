import Link from "next/link";
import { notFound } from "next/navigation";

import { FormFeedback } from "@/components/shared/form-feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCourseById } from "@/lib/institute/course-data";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
};

export default async function InstituteCourseDetailsPage({ params, searchParams }: Props) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const { submitted } = await searchParams;

  const detail = await getInstituteCourseById(user.id, id);
  if (!detail) notFound();

  const { course, media } = detail;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{course.title}</h1>
          <p className="mt-1 text-sm text-slate-600">Institute course details and moderation status.</p>
        </div>
        <StatusBadge status={course.status} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/institute/courses/new" className="rounded border border-brand-300 bg-brand-50 px-3 py-1.5 text-brand-700 hover:bg-brand-100">Add new course</Link>
        <Link href={`/institute/courses/${course.id}/edit`} className="rounded border px-3 py-1.5 hover:bg-slate-50">Edit</Link>
        {course.status === "rejected" ? <Link href={`/institute/courses/${course.id}/resubmit`} className="rounded border border-rose-300 px-3 py-1.5 text-rose-700 hover:bg-rose-50">Resubmit</Link> : null}
        <Link href="/institute/courses/manage" className="rounded border px-3 py-1.5 hover:bg-slate-50">Back to manage</Link>
      </div>

      {submitted === "1" ? <FormFeedback tone="success">Course submitted for admin approval.</FormFeedback> : null}
      {course.rejection_reason ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Rejection reason: {course.rejection_reason}</p> : null}

      <dl className="mt-6 grid gap-3 rounded border bg-white p-4 text-sm md:grid-cols-2">
        <div><dt className="font-medium">Summary</dt><dd>{course.summary ?? "-"}</dd></div>
        <div><dt className="font-medium">Description</dt><dd>{course.description ?? "-"}</dd></div>
        <div><dt className="font-medium">Category / Subject</dt><dd>{course.category ?? "-"} / {course.subject ?? "-"}</dd></div>
        <div><dt className="font-medium">Level / Language</dt><dd>{course.level ?? "-"} / {course.language ?? "-"}</dd></div>
        <div><dt className="font-medium">Fees</dt><dd>₹{course.fees}</dd></div>
        <div><dt className="font-medium">Duration</dt><dd>{course.duration} ({course.duration_value ?? "-"} {course.duration_unit ?? ""})</dd></div>
        <div><dt className="font-medium">Mode / Location</dt><dd>{course.mode} / {course.location ?? "-"}</dd></div>
        <div><dt className="font-medium">Schedule</dt><dd>{course.schedule ?? "-"}</dd></div>
        <div><dt className="font-medium">Dates</dt><dd>{course.admission_deadline ?? "-"} / {course.start_date ?? "-"} / {course.end_date ?? "-"}</dd></div>
        <div><dt className="font-medium">Eligibility</dt><dd>{course.eligibility ?? "-"}</dd></div>
        <div><dt className="font-medium">Learning outcomes</dt><dd>{course.learning_outcomes ?? "-"}</dd></div>
        <div><dt className="font-medium">Target audience</dt><dd>{course.target_audience ?? "-"}</dd></div>
        <div><dt className="font-medium">Certificate</dt><dd>{course.certificate_status ?? "-"} {course.certificate_details ? `· ${course.certificate_details}` : ""}</dd></div>
        <div><dt className="font-medium">Batch size</dt><dd>{course.batch_size ?? "-"}</dd></div>
      </dl>

      <section className="mt-6 rounded border bg-white p-4">
        <h2 className="font-semibold">Media ({media.length})</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {media.map((item) => (
            <li key={item.id}>{item.type}: {item.file_url}</li>
          ))}
          {media.length === 0 ? <li>No media uploaded.</li> : null}
        </ul>
      </section>
    </div>
  );
}
