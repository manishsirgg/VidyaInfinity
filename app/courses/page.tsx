import type { Route } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select(
      "id,title,slug,summary,fee_amount,category,course_level,language,delivery_mode,duration_value,duration_unit,start_date,course_media(file_url,type),approval_status"
    )
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Approved Courses</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {courses?.map((course) => {
          const previewImage = course.course_media?.find((media) => media.type === "image")?.file_url;
          const imageCount = course.course_media?.filter((media) => media.type === "image").length ?? 0;
          const videoCount = course.course_media?.filter((media) => media.type === "video").length ?? 0;

          return (
            <article key={course.id} className="rounded-xl border bg-white p-5">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt={course.title} className="mb-3 h-40 w-full rounded-md object-cover" />
              ) : null}
              <h2 className="text-lg font-medium">{course.title}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {course.category ?? "General"} · {course.course_level ?? "-"} · {course.language ?? "-"} · {course.delivery_mode ?? "-"}
              </p>
              <p className="mt-2 text-sm text-slate-600">{course.summary}</p>
              <p className="mt-2 text-sm text-slate-600">
                Duration: {course.duration_value ?? "-"} {course.duration_unit ?? ""} · Start: {course.start_date ?? "TBA"}
              </p>
              <p className="mt-2 text-sm font-medium">₹{course.fee_amount}</p>
              <p className="mt-2 text-xs text-slate-500">Media attached: {imageCount} images, {videoCount} videos</p>
              <Link href={`/courses/${course.slug}` as Route} className="mt-4 inline-block text-brand-600">
                View Course
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
