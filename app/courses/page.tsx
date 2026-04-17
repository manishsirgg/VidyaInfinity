import type { Route } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id,title,slug,summary,fee_amount,approval_status,course_media(media_url,media_type)")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Approved Courses</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {courses?.map((course) => (
          <article key={course.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{course.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{course.summary}</p>
            <p className="mt-2 text-sm font-medium">₹{course.fee_amount}</p>
            <p className="mt-2 text-xs text-slate-500">Media attached: {course.course_media?.length ?? 0}</p>
            <Link href={`/courses/${course.slug}` as Route} className="mt-4 inline-block text-brand-600">
              Enroll Now
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
