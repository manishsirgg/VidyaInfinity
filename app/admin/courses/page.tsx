import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function Page() {
  await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }
  const supabase = admin.data;

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id,title,category,subject,level,mode,language,summary,fees,status,faculty_name,batch_size,start_date,rejection_reason,course_media(id,type,file_url),created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to load courses for moderation", { error: error.message });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Courses Moderation</h1>
      {error ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load courses right now. Please refresh or check Supabase policies/logs.
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {courses?.map((course) => (
          <div key={course.id} className="rounded border bg-white p-4 text-sm">
            <p className="font-medium">{course.title} · {course.status}</p>
            <p className="text-slate-600">{course.category ?? "-"} · {course.subject ?? "-"} · {course.level ?? "-"} · {course.mode ?? "-"} · {course.language ?? "-"}</p>
            <p className="text-slate-600">₹{course.fees} · Start date: {course.start_date ?? "-"} · Batch: {course.batch_size ?? "-"}</p>
            <p className="mt-1 text-slate-700">{course.summary}</p>
            <p className="text-slate-600">Faculty: {course.faculty_name ?? "-"}</p>
            <p className="text-slate-600">Media: {course.course_media?.length ?? 0} file(s)</p>
            {(course.course_media ?? []).slice(0, 4).map((media) => (
              <p key={media.id} className="text-xs text-slate-500">{media.type}: {media.file_url}</p>
            ))}
            {course.rejection_reason && <p className="text-xs text-rose-600">Reason: {course.rejection_reason}</p>}
            <ModerationActions targetType="courses" targetId={course.id} currentStatus={course.status} />
          </div>
        ))}
        {!error && (courses?.length ?? 0) === 0 ? <p className="rounded border bg-white p-4 text-sm text-slate-600">No courses found for moderation.</p> : null}
      </div>
    </div>
  );
}
