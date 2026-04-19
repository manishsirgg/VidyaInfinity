import { CourseCreateForm } from "@/components/institute/course-create-form";
import { CourseManagementTable } from "@/components/institute/course-management-table";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: courses } = institute
    ? await dataClient
        .from("courses")
        .select("id,title,summary,category,level,fees,status,created_at,rejection_reason,start_date,batch_size,mode,duration")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const rejectedCourses = (courses ?? []).filter((course) => course.status === "rejected");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Create and manage courses. Every create/edit is sent to admin moderation.</p>
      <CourseCreateForm />
      <section id="manage-courses" className="scroll-mt-28">
        <h2 className="mt-8 text-lg font-semibold">Manage listed courses</h2>
        <p className="mt-1 text-sm text-slate-600">
          Edit or delete any listed course. If a course is rejected, update details and click{" "}
          <span className="font-medium">Resubmit</span> for re-approval.
        </p>
      </section>
      {rejectedCourses.length > 0 ? (
        <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          You have {rejectedCourses.length} rejected course{rejectedCourses.length === 1 ? "" : "s"} pending
          corrections.
        </p>
      ) : null}
      <CourseManagementTable courses={courses ?? []} />
    </div>
  );
}
