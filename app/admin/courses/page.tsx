import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from("courses")
    .select("id,title,category,subject,level,mode,language,summary,fees,status,faculty_name,batch_size,start_date,rejection_reason,course_media(id,type,file_url),created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Courses Moderation</h1>
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
      </div>
    </div>
  );
}
