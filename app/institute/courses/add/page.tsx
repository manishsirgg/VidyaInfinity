import { CourseCreateForm } from "@/components/institute/course-create-form";

export default function AddCoursePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Add Course</h1>
      <p className="mt-2 text-sm text-slate-600">Create a new course and submit it for admin moderation.</p>
      <CourseCreateForm />
    </div>
  );
}
