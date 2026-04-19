import { notFound } from "next/navigation";

import { InstituteCourseForm } from "@/components/institute/institute-course-form";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCourseById } from "@/lib/institute/course-data";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InstituteEditCoursePage({ params }: Props) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const detail = await getInstituteCourseById(user.id, id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Edit Course</h1>
      <p className="mt-2 text-sm text-slate-600">Update complete course details and media.</p>
      <div className="mt-6">
        <InstituteCourseForm
          mode="edit"
          submitEndpoint={`/api/institute/courses/${id}`}
          submitMethod="PATCH"
          submitLabel="Save Changes & Submit for Moderation"
          successMessage="Course updated and sent for moderation."
          initialCourse={detail.course}
          initialMedia={detail.media}
        />
      </div>
    </div>
  );
}
