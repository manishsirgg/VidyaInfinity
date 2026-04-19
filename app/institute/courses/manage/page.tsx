import Link from "next/link";

import { CourseDeleteButton } from "@/components/institute/course-delete-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteManageCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id);
  const approvedCount = courses.filter((course) => course.status === "approved").length;
  const pendingCount = courses.filter((course) => course.status === "pending").length;
  const rejectedCount = courses.filter((course) => course.status === "rejected").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Manage Courses</h1>
            <p className="mt-2 text-sm text-slate-600">Review status, keep listings up to date, and act on feedback.</p>
          </div>
          <Link
            href="/institute/courses/new"
            className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-100"
          >
            + Add new course
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{courses.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Approved</p>
            <p className="mt-1 text-xl font-semibold text-emerald-900">{approvedCount}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
            <p className="mt-1 text-xl font-semibold text-amber-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-rose-700">Rejected</p>
            <p className="mt-1 text-xl font-semibold text-rose-900">{rejectedCount}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {courses.map((course) => (
          <article key={course.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">{course.summary ?? "No summary provided."}</p>
              </div>
              <StatusBadge status={course.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">₹{course.fees}</span>
              <span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">{course.mode}</span>
              <span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">{course.duration}</span>
              <span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">Starts {course.start_date ?? "TBA"}</span>
            </div>
            {course.rejection_reason ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Rejection reason: {course.rejection_reason}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/institute/courses/${course.id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
                View details
              </Link>
              <Link href={`/institute/courses/${course.id}/edit`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">
                Edit
              </Link>
              <CourseDeleteButton courseId={course.id} title={course.title} />
            </div>
          </article>
        ))}
        {courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-6 py-10 text-center">
            <p className="text-lg font-semibold text-slate-900">No courses yet</p>
            <p className="mt-1 text-sm text-slate-600">Start by publishing your first course listing.</p>
            <Link
              href="/institute/courses/new"
              className="mt-4 inline-flex rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100"
            >
              Add first course
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
