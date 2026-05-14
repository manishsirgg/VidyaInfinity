import Link from "next/link";

import { CourseArchiveActions } from "@/components/institute/course-archive-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { listInstituteCourses } from "@/lib/institute/course-data";

export default async function InstituteManageCoursesPage({ searchParams }: { searchParams?: Promise<{ scope?: string; status?: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await listInstituteCourses(user.id, { includeArchived: true });
  const params = (await searchParams) ?? {};
  const scope = params.scope === "archived" ? "archived" : "active";
  const statusFilter = ["approved", "pending", "rejected"].includes(params.status ?? "") ? (params.status as "approved" | "pending" | "rejected") : "all";

  const activeCourses = courses.filter((course) => !course.is_deleted);
  const archivedCourses = courses.filter((course) => course.is_deleted);
  const scopedCourses = (scope === "archived" ? archivedCourses : activeCourses).filter((course) => (statusFilter === "all" ? true : course.status === statusFilter));

  const approvedCount = activeCourses.filter((course) => course.status === "approved").length;
  const pendingCount = activeCourses.filter((course) => course.status === "pending").length;
  const rejectedCount = activeCourses.filter((course) => course.status === "rejected").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Manage Courses</h1>
          </div>
          <Link href="/institute/courses/new" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-100">+ Add new course</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl border bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-wide text-slate-500">Active Total</p><p className="mt-1 text-xl font-semibold text-slate-900">{activeCourses.length}</p></div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3"><p className="text-xs uppercase tracking-wide text-emerald-700">Approved</p><p className="mt-1 text-xl font-semibold text-emerald-900">{approvedCount}</p></div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3"><p className="text-xs uppercase tracking-wide text-amber-700">Pending</p><p className="mt-1 text-xl font-semibold text-amber-900">{pendingCount}</p></div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3"><p className="text-xs uppercase tracking-wide text-rose-700">Rejected</p><p className="mt-1 text-xl font-semibold text-rose-900">{rejectedCount}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3"><p className="text-xs uppercase tracking-wide text-slate-700">Archived</p><p className="mt-1 text-xl font-semibold text-slate-900">{archivedCourses.length}</p></div>
        </div>
      </section>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/institute/courses/manage?scope=active" className={`rounded-lg border px-3 py-1.5 text-sm ${scope === "active" ? "border-brand-300 bg-brand-50 text-brand-800" : "hover:bg-slate-50"}`}>Active Courses</Link>
        <Link href="/institute/courses/manage?scope=archived" className={`rounded-lg border px-3 py-1.5 text-sm ${scope === "archived" ? "border-brand-300 bg-brand-50 text-brand-800" : "hover:bg-slate-50"}`}>Archived Courses</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", "approved", "pending", "rejected"] as const).map((status) => (<Link key={status} href={`/institute/courses/manage?scope=${scope}&status=${status}`} className={`rounded-md border px-3 py-1 text-xs uppercase tracking-wide ${statusFilter === status ? "border-slate-700 bg-slate-700 text-white" : "hover:bg-slate-50"}`}>{status}</Link>))}
      </div>
      <div className="mt-6 space-y-3">
        {scopedCourses.map((course) => (
          <article key={course.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-900">{course.title}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{course.summary ?? "No summary provided."}</p></div><div className="flex items-center gap-2"><StatusBadge status={course.status} />{course.is_deleted ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Archived</span> : null}</div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm"><span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">₹{course.fees}</span><span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">{course.mode}</span><span className="rounded-md border bg-slate-50 px-2.5 py-1 text-slate-700">{course.duration}</span></div>
            <div className="mt-4 flex flex-wrap gap-2"><Link href={`/institute/courses/${course.id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">View details</Link>{!course.is_deleted ? <Link href={`/institute/courses/${course.id}/edit`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Edit</Link> : null}<CourseArchiveActions courseId={course.id} title={course.title} isArchived={course.is_deleted} /></div>
          </article>
        ))}
      </div>
    </div>
  );
}
