import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteCoursesLandingPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id);

  const approved = courses.filter((course) => course.status === "approved").length;
  const pending = courses.filter((course) => course.status === "pending").length;
  const rejected = courses.filter((course) => course.status === "rejected").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Create, track, and improve all courses from one place.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold">{courses.length}</p>
        </div>
        <div className="rounded border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{approved}</p>
        </div>
        <div className="rounded border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{pending}</p>
        </div>
        <div className="rounded border border-rose-100 bg-rose-50 p-3">
          <p className="text-xs uppercase tracking-wide text-rose-700">Rejected</p>
          <p className="mt-1 text-2xl font-semibold text-rose-900">{rejected}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link href="/institute/courses/new" className="rounded border bg-white p-4 hover:bg-slate-50">
          <h2 className="font-semibold">Add Course</h2>
          <p className="mt-1 text-sm text-slate-600">Create a new course and submit it for moderation.</p>
        </Link>
        <Link href="/institute/courses/manage" className="rounded border bg-white p-4 hover:bg-slate-50">
          <h2 className="font-semibold">Manage Courses</h2>
          <p className="mt-1 text-sm text-slate-600">View details, edit, and delete your existing courses.</p>
        </Link>
        <Link href="/institute/courses/rejected" className="rounded border bg-white p-4 hover:bg-slate-50">
          <h2 className="font-semibold">Rejected Courses</h2>
          <p className="mt-1 text-sm text-slate-600">Fix rejected courses and resubmit for moderation.</p>
        </Link>
        <Link href="/institute/courses/featured" className="rounded border bg-white p-4 hover:bg-slate-50">
          <h2 className="font-semibold">Feature Courses</h2>
          <p className="mt-1 text-sm text-slate-600">Promote approved courses with course-level featured plans.</p>
        </Link>
      </div>

      <div className="mt-6 rounded border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Recently updated</h2>
          <Link href="/institute/courses/manage" className="text-sm text-brand-700">
            Open full manager
          </Link>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          {courses.slice(0, 6).map((course) => (
            <div key={course.id} className="rounded border px-3 py-2">
              <Link href={`/institute/courses/${course.id}`} className="font-medium text-brand-700 hover:underline">
                {course.title}
              </Link>
              <p className="text-slate-600">
                Status: {course.status} · Fees: ₹{course.fees} · Starts: {course.start_date ?? "TBA"}
              </p>
            </div>
          ))}
          {courses.length === 0 ? (
            <div className="rounded border bg-slate-50 px-3 py-2 text-slate-600">
              No courses yet. Add your first course to start receiving leads and enrollments.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
