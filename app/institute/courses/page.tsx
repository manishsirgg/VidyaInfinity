import Link from "next/link";

export default function InstituteCoursesLandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Use the dedicated workflows below to create, manage, and resubmit institute courses.</p>

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
      </div>
    </div>
  );
}
