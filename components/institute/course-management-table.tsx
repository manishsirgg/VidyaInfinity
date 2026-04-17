"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "@/components/shared/form-feedback";

type Course = {
  id: string;
  title: string;
  category: string | null;
  course_level: string | null;
  fee_amount: number;
  approval_status: string;
  created_at: string;
  rejection_reason: string | null;
  start_date: string | null;
  total_seats: number | null;
  summary: string;
};

type Props = {
  courses: Course[];
};

export function CourseManagementTable({ courses }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    title: "",
    summary: "",
    feeAmount: "",
    startDate: "",
    totalSeats: "",
  });

  const editErrors = useMemo(() => {
    if (!editingId) return {} as Record<string, string>;
    const next: Record<string, string> = {};
    if (!formValues.title.trim()) next.title = "Title is required.";
    if (!formValues.summary.trim()) next.summary = "Summary is required.";
    const fee = Number(formValues.feeAmount);
    if (!Number.isFinite(fee) || fee <= 0) next.feeAmount = "Fee must be a positive number.";
    if (formValues.totalSeats.trim()) {
      const seats = Number(formValues.totalSeats);
      if (!Number.isInteger(seats) || seats < 0) next.totalSeats = "Total seats must be a non-negative whole number.";
    }
    return next;
  }, [editingId, formValues]);

  async function handleDelete(courseId: string) {
    if (!window.confirm("Delete this course? This cannot be undone.")) return;

    setBusyId(courseId);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);

    setBusyId(null);

    if (!response.ok) {
      setError(body?.error ?? "Unable to delete course.");
      return;
    }

    setSuccess("Course deleted successfully.");
    router.refresh();
  }

  function startEditing(course: Course) {
    setEditingId(course.id);
    setError("");
    setSuccess("");
    setFormValues({
      title: course.title,
      summary: course.summary,
      feeAmount: String(course.fee_amount),
      startDate: course.start_date ?? "",
      totalSeats: course.total_seats ? String(course.total_seats) : "",
    });
  }

  async function save(courseId: string) {
    setError("");
    setSuccess("");

    if (Object.keys(editErrors).length > 0) {
      setError("Please fix the highlighted fields before saving changes.");
      return;
    }

    setBusyId(courseId);

    const response = await fetch(`/api/institute/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formValues.title,
        summary: formValues.summary,
        feeAmount: formValues.feeAmount,
        startDate: formValues.startDate,
        totalSeats: formValues.totalSeats,
      }),
    });

    const body = await response.json().catch(() => null);
    setBusyId(null);

    if (!response.ok) {
      setError(body?.error ?? "Unable to update course.");
      return;
    }

    setEditingId(null);
    setSuccess(body?.message ?? "Course updated successfully.");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {courses.map((course) => {
        const isEditing = editingId === course.id;
        const isBusy = busyId === course.id;

        return (
          <div key={course.id} className="rounded border bg-white p-4 text-sm">
            {isEditing ? (
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Course title</span>
                  <input
                    value={formValues.title}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, title: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
                  {editErrors.title ? <p className="text-xs text-rose-700">{editErrors.title}</p> : null}
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Fee (₹)</span>
                  <input
                    type="number"
                    min="1"
                    value={formValues.feeAmount}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, feeAmount: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
                  {editErrors.feeAmount ? <p className="text-xs text-rose-700">{editErrors.feeAmount}</p> : null}
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">Summary</span>
                  <textarea
                    value={formValues.summary}
                    rows={2}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, summary: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
                  {editErrors.summary ? <p className="text-xs text-rose-700">{editErrors.summary}</p> : null}
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Start date</span>
                  <input
                    type="date"
                    value={formValues.startDate}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, startDate: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Total seats</span>
                  <input
                    type="number"
                    min="0"
                    value={formValues.totalSeats}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, totalSeats: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
                  {editErrors.totalSeats ? <p className="text-xs text-rose-700">{editErrors.totalSeats}</p> : null}
                </label>
                <div className="flex gap-2 md:col-span-2">
                  <button
                    disabled={isBusy}
                    onClick={() => save(course.id)}
                    className="rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-60"
                  >
                    {isBusy ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => setEditingId(null)}
                    className="rounded border px-3 py-2 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium">
                  {course.title} · {course.category ?? "-"} · {course.course_level ?? "-"}
                </p>
                <p>
                  ₹{course.fee_amount} · Starts {course.start_date ?? "TBA"} · Seats {course.total_seats ?? "-"} · Status:{" "}
                  {course.approval_status}
                </p>
                {course.rejection_reason ? <p className="text-rose-600">Reason: {course.rejection_reason}</p> : null}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => startEditing(course)} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                    Edit
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => handleDelete(course.id)}
                    className="rounded border border-rose-300 px-3 py-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    {isBusy ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {courses.length === 0 ? <p className="text-sm text-slate-600">No courses listed yet.</p> : null}
      {success ? <FormFeedback tone="success">{success}</FormFeedback> : null}
      {error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </div>
  );
}
