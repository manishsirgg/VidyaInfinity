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

export default function InstituteCoursesLandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Courses</h1>
      <p className="mt-2 text-sm text-slate-600">Use dedicated pages to add a new course, manage all listed courses, or review rejected courses pending resubmission.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link href="/institute/courses/add" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Add Course</h2>
          <p className="mt-1 text-sm text-slate-600">Create and submit a complete course with media.</p>
        </Link>
        <Link href="/institute/courses/manage" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Manage Courses</h2>
          <p className="mt-1 text-sm text-slate-600">View all courses in card view with edit/delete actions.</p>
        </Link>
        <Link href="/institute/courses/rejected" className="rounded border bg-white p-5 hover:border-brand-300">
          <h2 className="text-lg font-medium">Rejected & Resubmission</h2>
          <p className="mt-1 text-sm text-slate-600">See rejected courses with full details and resubmit updates.</p>
        </Link>
      </div>
    </div>
  );
}
