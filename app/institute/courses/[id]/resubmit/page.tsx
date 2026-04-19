import { notFound, redirect } from "next/navigation";

import { InstituteCourseForm } from "@/components/institute/institute-course-form";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteCourseById } from "@/lib/institute/course-data";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InstituteResubmitCoursePage({ params }: Props) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const detail = await getInstituteCourseById(user.id, id);
  if (!detail) notFound();

  if (detail.course.status !== "rejected") {
    redirect(`/institute/courses/${id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Resubmit Rejected Course</h1>
      <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Rejection reason: {detail.course.rejection_reason ?? "No reason provided"}</p>
      <div className="mt-6">
        <InstituteCourseForm
          mode="resubmit"
          submitEndpoint={`/api/institute/courses/${id}/resubmit`}
          submitMethod="PATCH"
          submitLabel="Resubmit for Moderation"
          successMessage="Course resubmitted for moderation."
          initialCourse={detail.course}
          initialMedia={detail.media}
        />
      </div>
    </div>
  );
}
