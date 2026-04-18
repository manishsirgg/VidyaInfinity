import { CourseCreateForm } from "@/components/institute/course-create-form";
import { CourseManagementTable } from "@/components/institute/course-management-table";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();

  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: courses } = institute
    ? await supabase
        .from("courses")
        .select("id,title,summary,category,level,fees,status,created_at,rejection_reason,start_date,batch_size,mode,duration")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Create and manage courses. Every create/edit is sent to admin moderation.</p>
      <CourseCreateForm />
      <h2 className="mt-8 text-lg font-semibold">Manage listed courses</h2>
      <CourseManagementTable courses={courses ?? []} />
    </div>
  );
}
