import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from("courses")
    .select("id,title,approval_status,institute_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Courses</h1>
      <div className="mt-4 space-y-2">
        {courses?.map((course) => (
          <div key={course.id} className="rounded border bg-white p-3 text-sm">
            {course.title} · {course.approval_status} · {course.institute_id}
          </div>
        ))}
      </div>
    </div>
  );
}
