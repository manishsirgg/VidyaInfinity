import { CourseCreateForm } from "@/components/institute/course-create-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteAddCoursePage() {
  await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Add Course</h1>
      <p className="mt-2 text-sm text-slate-600">Create a new course submission. Course approvals are moderated by admins.</p>
      <div className="mt-6">
        <CourseCreateForm />
      </div>
    </div>
  );
}
