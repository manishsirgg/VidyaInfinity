import Link from "next/link";

export default function InstituteCoursesLandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Use dedicated pages to add a new course, manage all listed courses, or review rejected courses pending resubmission.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link href="/institute/courses/add" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Add Course</h2>
          <p className="mt-1 text-sm text-slate-600">Create and submit a complete course with media.</p>
        </Link>
        <Link href="/institute/courses/manage" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Manage Courses</h2>
          <p className="mt-1 text-sm text-slate-600">View all courses in card view with edit/delete actions.</p>
        </Link>
        <Link href="/institute/courses/rejected" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Rejected & Resubmission</h2>
          <p className="mt-1 text-sm text-slate-600">See rejected courses with full details and resubmit updates.</p>
        </Link>
      </div>
    </div>
  );
}
