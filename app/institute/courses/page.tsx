import { CourseCreateForm } from "@/components/institute/course-create-form";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: courses } = institute
    ? await supabase
        .from("courses")
        .select("id,title,category,course_level,fee_amount,approval_status,created_at,rejection_reason,start_date")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">
        Add detailed course information and media. Each submission goes to admin review and is published only after
        approval.
      </p>
      <CourseCreateForm />
      <div className="mt-6 space-y-2">
        {courses?.map((course) => (
          <div key={course.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">
              {course.title} · {course.category ?? "-"} · {course.course_level ?? "-"}
            </p>
            <p>
              ₹{course.fee_amount} · Starts {course.start_date ?? "TBA"} · Status: {course.approval_status}
            </p>
            {course.rejection_reason ? <p className="text-rose-600">Reason: {course.rejection_reason}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
