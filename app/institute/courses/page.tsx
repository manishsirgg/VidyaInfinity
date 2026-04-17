import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: courses } = institute
    ? await supabase
        .from("courses")
        .select("id,title,fee_amount,approval_status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <div className="mt-4 space-y-2">
        {courses?.map((course) => (
          <div key={course.id} className="rounded border bg-white p-3 text-sm">
            {course.title} · ₹{course.fee_amount} · {course.approval_status}
          </div>
        ))}
      </div>
    </div>
  );
}
