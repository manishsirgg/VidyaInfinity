import type { Route } from "next";
import Link from "next/link";

import { CourseCompareBar } from "@/components/courses/course-compare-bar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActiveFeaturedInstituteRecord = {
  institute_id: string;
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data: courses } = await dataClient
    .from("courses")
    .select("id,institute_id,title,summary,fees,category,subject,level,language,mode,duration,location,course_media(file_url,type),status")
    .eq("status", "approved")
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false });
  const instituteIds = [...new Set((courses ?? []).map((course) => course.institute_id).filter(Boolean))];
  const nowIso = new Date().toISOString();
  const featuredRows = instituteIds.length
    ? (
        await dataClient
          .from("institute_featured_subscriptions")
          .select("institute_id")
          .eq("status", "active")
          .lte("starts_at", nowIso)
          .gt("ends_at", nowIso)
          .in("institute_id", instituteIds)
      ).data ?? []
    : [];
  const featuredInstituteIds = new Set(
    (featuredRows as ActiveFeaturedInstituteRecord[])
      .map((row) => row.institute_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const sortedCourses = [...(courses ?? [])].sort(
    (left, right) => Number(featuredInstituteIds.has(right.institute_id)) - Number(featuredInstituteIds.has(left.institute_id))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Approved Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Browse verified courses and open each card to explore complete details.</p>

      <div className="mt-6">
        <CourseCompareBar courses={sortedCourses.map((course) => ({ id: course.id, title: course.title }))} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {sortedCourses.map((course) => {
          const previewImage = course.course_media?.find((media) => media.type === "image")?.file_url;
          const imageCount = course.course_media?.filter((media) => media.type === "image").length ?? 0;
          const videoCount = course.course_media?.filter((media) => media.type === "video").length ?? 0;

          return (
            <Link href={`/courses/${course.id}` as Route} key={course.id} className="group rounded-xl border bg-white p-5 transition hover:border-brand-300">
            <article>
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt={course.title} className="mb-3 h-40 w-full rounded-md object-cover" />
              ) : (
                <div className="mb-3 grid h-40 w-full place-items-center rounded-md border border-dashed text-xs text-slate-500">No preview image</div>
              )}
              <h2 className="text-lg font-medium">{course.title}</h2>
              {featuredInstituteIds.has(course.institute_id) ? (
                <p className="mt-1 inline-flex w-fit rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Featured Institute
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                {course.category ?? "General"} · {course.subject ?? "-"} · {course.level ?? "-"} · {course.language ?? "-"}
              </p>
              <p className="mt-2 text-sm text-slate-600">{course.summary}</p>
              <p className="mt-2 text-sm text-slate-600">Duration: {course.duration ?? "-"} · Mode: {course.mode ?? "-"}</p>
              <p className="mt-2 text-sm text-slate-600">Location: {course.location ?? "TBA"}</p>
              <p className="mt-2 text-sm font-medium">₹{course.fees}</p>
              <p className="mt-2 text-xs text-slate-500">Media attached: {imageCount} images, {videoCount} videos</p>
              <p className="mt-4 inline-block text-brand-600 group-hover:underline">View Course</p>
            </article>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
