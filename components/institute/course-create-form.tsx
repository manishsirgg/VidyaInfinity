"use client";

import { InstituteCourseForm } from "@/components/institute/institute-course-form";

export function CourseCreateForm() {
  return (
    <InstituteCourseForm
      mode="create"
      submitEndpoint="/api/institute/courses"
      submitMethod="POST"
      submitLabel="Submit Course for Admin Approval"
      successMessage="Course submitted for admin approval."
    />
  );
}
