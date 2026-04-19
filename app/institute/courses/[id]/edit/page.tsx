import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseEditorForm } from "@/components/institute/course-editor-form";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCourseById } from "@/lib/institute/course-queries";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;

  const course = await getInstituteCourseById(user.id, id);
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/institute/courses/manage" className="text-brand-700">← Back to Manage Courses</Link>
        <span className="text-slate-400">|</span>
        <Link href="/institute/courses/rejected" className="text-brand-700">Rejected Courses</Link>
      </div>
      <CourseEditorForm course={course} />
    </div>
  );
}
