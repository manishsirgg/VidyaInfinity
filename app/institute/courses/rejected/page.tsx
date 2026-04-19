import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteRejectedCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id);
  const rejected = courses.filter((course) => course.status === "rejected");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Rejected Courses & Resubmission</h1>
      <p className="mt-2 text-sm text-slate-600">Only courses awaiting correction and resubmission appear here.</p>

      <div className="mt-6 space-y-3">
        {rejected.map((course) => (
          <article key={course.id} className="rounded border border-rose-200 bg-rose-50 p-4">
            <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
            <p className="mt-1 text-sm text-slate-700">{course.summary ?? "No summary provided."}</p>
            <p className="mt-2 text-sm text-rose-700">Rejection reason: {course.rejection_reason ?? "No reason provided."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/institute/courses/${course.id}`} className="rounded border border-rose-300 bg-white px-3 py-1.5 text-sm hover:bg-rose-100">View details</Link>
              <Link href={`/institute/courses/${course.id}/resubmit`} className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700">Open resubmission</Link>
            </div>
          </article>
        ))}
        {rejected.length === 0 ? <p className="text-sm text-slate-600">No rejected courses pending correction.</p> : null}
      </div>
    </div>
  );
}
