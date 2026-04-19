import Link from "next/link";

import { CourseDeleteButton } from "@/components/institute/course-delete-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteManageCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Manage Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Review and manage all courses created by your institute.</p>

      <div className="mt-6 space-y-3">
        {courses.map((course) => (
          <article key={course.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{course.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{course.summary ?? "No summary provided."}</p>
              </div>
              <StatusBadge status={course.status} />
            </div>
            <p className="mt-2 text-sm text-slate-700">₹{course.fees} · {course.mode} · {course.duration} · Starts {course.start_date ?? "TBA"}</p>
            {course.rejection_reason ? <p className="mt-2 text-sm text-rose-700">Reason: {course.rejection_reason}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/institute/courses/${course.id}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">View details</Link>
              <Link href={`/institute/courses/${course.id}/edit`} className="rounded border px-3 py-1.5 hover:bg-slate-50">Edit</Link>
              <CourseDeleteButton courseId={course.id} title={course.title} />
            </div>
          </article>
        ))}
        {courses.length === 0 ? <p className="text-sm text-slate-600">No courses found. Add your first course.</p> : null}
      </div>
    </div>
  );
}
