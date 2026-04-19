import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCoursesByUserId } from "@/lib/institute/course-queries";

export default async function RejectedCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const rejectedCourses = await getInstituteCoursesByUserId(user.id, "rejected");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Rejected Courses & Resubmission</h1>
      <p className="mt-2 text-sm text-slate-600">Courses waiting for correction are shown below with full details. Open each one to edit complete details and resubmit.</p>

      <div className="mt-6 space-y-4">
        {rejectedCourses.map((course) => (
          <article key={course.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{course.title}</h2>
                <p className="text-sm text-slate-600">Status: Waiting for correction · Fee: ₹{course.fees}</p>
              </div>
              <Link href={`/institute/courses/${course.id}/edit`} className="rounded border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50">Edit full details & Resubmit</Link>
            </div>
            <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Rejection reason: {course.rejection_reason ?? "Not specified"}</p>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="text-slate-500">Summary</dt><dd>{course.summary ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Category / Subject</dt><dd>{course.category ?? "-"} / {course.subject ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Level / Language</dt><dd>{course.level ?? "-"} / {course.language ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Mode / Duration</dt><dd>{course.mode ?? "-"} / {course.duration ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Schedule</dt><dd>{course.schedule ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Dates</dt><dd>Apply by {course.admission_deadline ?? "-"} · Start {course.start_date ?? "-"}</dd></div>
              <div className="md:col-span-2"><dt className="text-slate-500">Description</dt><dd className="whitespace-pre-wrap">{course.description ?? "-"}</dd></div>
              <div className="md:col-span-2"><dt className="text-slate-500">Eligibility</dt><dd>{course.eligibility ?? "-"}</dd></div>
              <div className="md:col-span-2"><dt className="text-slate-500">Learning outcomes</dt><dd>{course.learning_outcomes ?? "-"}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {rejectedCourses.length === 0 ? <p className="mt-4 rounded border bg-white px-4 py-3 text-sm text-slate-600">No rejected courses are currently waiting for resubmission.</p> : null}
    </div>
  );
}
