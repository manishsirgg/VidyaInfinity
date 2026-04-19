import Link from "next/link";

import { SavedCourseActions } from "@/components/student/saved-course-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function SavedCoursesPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const { data: savedItems } = await supabase
    .from("student_saved_courses")
    .select("id,created_at,course:courses!inner(id,title,summary,fees,status,is_active)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saved Courses</h1>
          <p className="mt-1 text-sm text-slate-600">Keep courses for later and move them to your checkout cart whenever you are ready.</p>
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

      <div className="mt-6 space-y-2">
        {(savedItems ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No saved courses yet.</div>
        ) : null}

        {(savedItems ?? []).map((item) => {
          const course = Array.isArray(item.course) ? item.course[0] : item.course;
          return (
            <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">{course?.title ?? "Course"}</p>
              <p className="mt-1 text-slate-700">{course?.summary ?? "No summary available."}</p>
              <p className="mt-1 text-slate-600">Fee: ₹{Number(course?.fees ?? 0)}</p>
              <SavedCourseActions courseId={course?.id ?? ""} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
