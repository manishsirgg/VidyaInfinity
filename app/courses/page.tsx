import type { Route } from "next";
import Link from "next/link";

import { CourseCompareBar } from "@/components/courses/course-compare-bar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActiveFeaturedCourseRecord = {
  course_id: string;
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data: courses } = await dataClient
    .from("courses")
    .select("id,institute_id,title,summary,fees,category,subject,level,language,mode,duration,location,course_media(file_url,type),status")
    .eq("status", "approved")
    .eq("is_deleted", false)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false });
  const courseIds = [...new Set((courses ?? []).map((course) => course.id).filter(Boolean))];
  const featuredRows = courseIds.length ? ((await dataClient.from("active_featured_courses").select("course_id").in("course_id", courseIds)).data ?? []) : [];
  const featuredCourseIds = new Set(
    (featuredRows as ActiveFeaturedCourseRecord[])
      .map((row) => row.course_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const sortedCourses = [...(courses ?? [])].sort(
    (left, right) => Number(featuredCourseIds.has(right.id)) - Number(featuredCourseIds.has(left.id))
  );

  return (
    <div className="vi-page">
      <h1 className="vi-page-title">Approved Courses</h1>
      <p className="vi-page-subtitle">Browse verified courses with clearer highlights for format, learning level, delivery mode, fees, and media richness.</p>

      <div className="mt-6 vi-card p-4">
        <CourseCompareBar courses={sortedCourses.map((course) => ({ id: course.id, title: course.title }))} />
      </div>

      {sortedCourses.length === 0 ? (
        <div className="mt-8 vi-empty">
          <p className="text-sm font-medium text-slate-700">No approved courses available right now.</p>
          <p className="mt-1 text-xs text-slate-500">Please check again shortly for newly approved listings.</p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {sortedCourses.map((course) => {
          const previewImage = course.course_media?.find((media) => media.type === "image")?.file_url;
          const imageCount = course.course_media?.filter((media) => media.type === "image").length ?? 0;
          const videoCount = course.course_media?.filter((media) => media.type === "video").length ?? 0;

          return (
            <Link href={`/courses/${course.id}` as Route} key={course.id} className="vi-card vi-card-hover group overflow-hidden p-4 sm:p-5">
              <article>
                {previewImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewImage} alt={course.title} className="mb-4 h-44 w-full rounded-lg object-cover" />
                ) : (
                  <div className="mb-4 grid h-44 w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">No preview image</div>
                )}

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
                  {featuredCourseIds.has(course.id) ? <span className="vi-chip border-amber-200 bg-amber-50 text-amber-700">Featured</span> : null}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {course.category ?? "General"} · {course.subject ?? "-"} · {course.level ?? "-"} · {course.language ?? "-"}
                </p>
                <p className="mt-3 text-sm text-slate-600">{course.summary}</p>

                <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-slate-900">Duration:</span> {course.duration ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Mode:</span> {course.mode ?? "-"}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="font-medium text-slate-900">Location:</span> {course.location ?? "TBA"}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-base font-semibold text-slate-900">₹{course.fees}</p>
                  <p className="text-xs text-slate-500">{imageCount} images · {videoCount} videos</p>
                </div>
                <p className="mt-3 inline-flex items-center text-sm font-medium text-brand-700 group-hover:underline">View course details</p>
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
