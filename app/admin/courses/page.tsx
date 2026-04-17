import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from("courses")
    .select(
      "id,title,category,course_level,delivery_mode,language,summary,fee_amount,approval_status,instructor_name,total_seats,start_date,rejection_reason,course_media(id,media_type,media_url),created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Courses Moderation</h1>
      <div className="mt-4 space-y-3">
        {courses?.map((course) => (
          <div key={course.id} className="rounded border bg-white p-4 text-sm">
            <p className="font-medium">
              {course.title} · {course.approval_status}
            </p>
            <p className="text-slate-600">
              {course.category ?? "-"} · {course.course_level ?? "-"} · {course.delivery_mode ?? "-"} · {course.language ?? "-"}
            </p>
            <p className="text-slate-600">₹{course.fee_amount} · Start date: {course.start_date ?? "-"} · Seats: {course.total_seats ?? "-"}</p>
            <p className="mt-1 text-slate-700">{course.summary}</p>
            <p className="text-slate-600">Instructor: {course.instructor_name ?? "-"}</p>
            <p className="text-slate-600">Media: {course.course_media?.length ?? 0} file(s)</p>
            {(course.course_media ?? []).slice(0, 4).map((media) => (
              <p key={media.id} className="text-xs text-slate-500">
                {media.media_type}: {media.media_url}
              </p>
            ))}
            {course.rejection_reason && <p className="text-xs text-rose-600">Reason: {course.rejection_reason}</p>}
            <ModerationActions targetType="courses" targetId={course.id} currentStatus={course.approval_status} />
          </div>
        ))}
      </div>
    </div>
  );
}
