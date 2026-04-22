import Link from "next/link";

import { SavedCourseActions } from "@/components/student/saved-course-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function SavedCoursesPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const [{ data: savedCourseItems }, { data: savedWebinarItems }] = await Promise.all([
    supabase
    .from("student_saved_courses")
    .select("id,created_at,course:courses!inner(id,title,summary,fees,status,is_active)")
    .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_saved_webinars")
      .select("id,created_at,webinar:webinars!inner(id,title,description,starts_at,webinar_mode,price,currency,approval_status,status,is_public)")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saved</h1>
          <p className="mt-1 text-sm text-slate-600">Keep courses and webinars here for quick access later.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/student/cart" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            View Cart
          </Link>
          <Link href="/courses" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
            Browse Courses
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {(savedCourseItems ?? []).length === 0 && (savedWebinarItems ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No saved items yet.</div>
        ) : null}

        {(savedCourseItems ?? []).map((item) => {
          const course = Array.isArray(item.course) ? item.course[0] : item.course;
          return (
            <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="text-xs uppercase text-brand-700">Course</p>
              <p className="font-medium text-slate-900">{course?.title ?? "Course"}</p>
              <p className="mt-1 text-slate-700">{course?.summary ?? "No summary available."}</p>
              <p className="mt-1 text-slate-600">Fee: ₹{Number(course?.fees ?? 0)}</p>
              <SavedCourseActions courseId={course?.id ?? ""} />
            </div>
          );
        })}

        {(savedWebinarItems ?? []).map((item) => {
          const webinar = Array.isArray(item.webinar) ? item.webinar[0] : item.webinar;
          return (
            <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="text-xs uppercase text-brand-700">Webinar</p>
              <p className="font-medium text-slate-900">{webinar?.title ?? "Webinar"}</p>
              <p className="mt-1 text-slate-700">{webinar?.description ?? "No description available."}</p>
              <p className="mt-1 text-slate-600">
                {webinar?.webinar_mode === "paid" ? `Fee: ₹${Number(webinar?.price ?? 0)}` : "Free webinar"}
                {webinar?.starts_at ? ` · Starts: ${new Date(webinar.starts_at).toLocaleString()}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={`/webinars/${webinar?.id ?? ""}`} className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700">Open webinar</Link>
                <SavedCourseActions webinarId={webinar?.id ?? ""} itemType="webinar" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
