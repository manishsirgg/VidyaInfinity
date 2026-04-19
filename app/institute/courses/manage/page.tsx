import { ManageCourseCards } from "@/components/institute/manage-course-cards";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCoursesByUserId } from "@/lib/institute/course-queries";

export default async function ManageInstituteCoursesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const courses = await getInstituteCoursesByUserId(user.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Manage Courses (Edit/Delete)</h1>
      <p className="mt-2 text-sm text-slate-600">All institute courses are listed below as cards. Open any course to edit complete details or delete it.</p>

      <ManageCourseCards courses={courses} />
    </div>
  );
}
