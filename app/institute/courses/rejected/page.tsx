import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteRejectedCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id);
  const rejected = courses.filter((course) => course.status === "rejected");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Action required</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Rejected Courses &amp; Resubmission</h1>
        <p className="mt-2 text-sm text-slate-600">
          Courses listed here need corrections before they can be re-reviewed. Fix the noted issues and submit again.
        </p>
        <div className="mt-4 inline-flex items-center rounded-full border border-rose-200 bg-white px-3 py-1 text-sm font-medium text-rose-700">
          {rejected.length} course{rejected.length === 1 ? "" : "s"} waiting for resubmission
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {rejected.map((course) => (
          <article key={course.id} className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
            <p className="mt-1 text-sm text-slate-700">{course.summary ?? "No summary provided."}</p>
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Rejection reason: {course.rejection_reason ?? "No reason provided."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/institute/courses/${course.id}`}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm hover:bg-rose-100"
              >
                View details
              </Link>
              <Link
                href={`/institute/courses/${course.id}/resubmit`}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
              >
                Open resubmission
              </Link>
            </div>
          </article>
        ))}
        {rejected.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-emerald-900">Great news — no pending rejections</p>
            <p className="mt-1 text-sm text-emerald-800">All your courses are either approved or under review.</p>
            <Link
              href="/institute/courses/manage"
              className="mt-4 inline-flex rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Back to manage courses
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
