import { CourseCreateForm } from "@/components/institute/course-create-form";
import { CourseManagementTable } from "@/components/institute/course-management-table";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: courses } = institute
    ? await supabase
        .from("courses")
        .select("id,title,summary,category,course_level,fee_amount,approval_status,created_at,rejection_reason,start_date,total_seats")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">
        Create a new course, understand required dates at a glance, and manage existing listings from one place.
      </p>
      <div className="mt-4 grid gap-3 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-3">
        <div>
          <p className="font-medium text-slate-900">Add new course</p>
          <p>Complete all sections below to submit a brand-new listing for approval.</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Understand date fields</p>
          <p>Start date, end date, and admission deadline include helper context before submission.</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Manage existing courses</p>
          <p>Use the table to edit price/content or delete older drafts and rejected listings.</p>
        </div>
      </div>
      <CourseCreateForm />
      <h2 className="mt-8 text-lg font-semibold">Manage listed courses</h2>
      <p className="mt-1 text-sm text-slate-600">
        Update title, pricing, summary, seat availability, and schedule. Edits are automatically sent for re-approval.
      </p>
      <CourseManagementTable courses={courses ?? []} />
    </div>
  );
}
