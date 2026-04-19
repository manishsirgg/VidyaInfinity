import { CourseCreateForm } from "@/components/institute/course-create-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteAddCoursePage() {
  await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Course publishing</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Add Course</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Create a polished course listing for moderation and publishing. Clear details, pricing, and outcomes help
          your course get approved faster.
        </p>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div className="rounded-xl border border-brand-100 bg-white px-4 py-3">
            <p className="font-medium text-slate-900">1. Complete details</p>
            <p className="mt-1 text-xs text-slate-600">Title, summary, fees, duration, and schedule.</p>
          </div>
          <div className="rounded-xl border border-brand-100 bg-white px-4 py-3">
            <p className="font-medium text-slate-900">2. Add media</p>
            <p className="mt-1 text-xs text-slate-600">Upload thumbnails, brochures, and supporting content.</p>
          </div>
          <div className="rounded-xl border border-brand-100 bg-white px-4 py-3">
            <p className="font-medium text-slate-900">3. Submit for review</p>
            <p className="mt-1 text-xs text-slate-600">Admins will moderate and update status in notifications.</p>
          </div>
        </div>
      </section>

      <div className="mt-8 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <CourseCreateForm />
      </div>
    </div>
  );
}
