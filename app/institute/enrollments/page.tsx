import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();
  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();

  const { data: enrollments } = institute
    ? await supabase
        .from("course_enrollments")
        .select("id,user_id,course_id,enrollment_status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Enrollments</h1>
      <div className="mt-4 space-y-2">
        {enrollments?.map((enrollment) => (
          <div key={enrollment.id} className="rounded border bg-white p-3 text-sm">
            {enrollment.course_id} · {enrollment.user_id} · {enrollment.enrollment_status}
          </div>
        ))}
      </div>
    </div>
  );
}
