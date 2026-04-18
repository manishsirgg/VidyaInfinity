"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    title: "",
    summary: "",
    feeAmount: "",
    startDate: "",
    totalSeats: "",
  });


  async function handleResubmit(course: Course) {
    setBusyId(course.id);
    setError("");

    const response = await fetch(`/api/institute/courses/${course.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: course.title,
        summary: course.summary,
        feeAmount: course.fee_amount,
        startDate: course.start_date,
        totalSeats: course.total_seats,
      }),
    });

    const body = await response.json().catch(() => null);
    setBusyId(null);

    if (!response.ok) {
      setError(body?.error ?? "Unable to resubmit course.");
      return;
    }

    router.refresh();
  }
  async function handleDelete(courseId: string) {
    if (!window.confirm("Delete this course? This cannot be undone.")) return;

    setBusyId(courseId);
    setError("");

    const response = await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" });
    const body = await response.json();

    setBusyId(null);

    if (!response.ok) {
      setError(body.error ?? "Unable to delete course.");
      return;
    }

    router.refresh();
  }

  function startEditing(course: Course) {
    setEditingId(course.id);
    setError("");
    setFormValues({
      title: course.title,
      summary: course.summary,
      feeAmount: String(course.fee_amount),
      startDate: course.start_date ?? "",
      totalSeats: course.total_seats ? String(course.total_seats) : "",
    });
  }

  async function save(courseId: string) {
    setBusyId(courseId);
    setError("");

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

    const body = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setError(body.error ?? "Unable to update course.");
      return;
    }

    setEditingId(null);
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
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">Summary</span>
                  <textarea
                    value={formValues.summary}
                    rows={2}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, summary: event.target.value }))}
                    className="rounded border px-3 py-2"
                  />
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
                  ₹{course.fee_amount} · Starts {course.start_date ?? "TBA"} · Seats {course.total_seats ?? "-"} · Status: {" "}
                  {course.approval_status}
                </p>
                {course.rejection_reason ? <p className="text-rose-600">Reason: {course.rejection_reason}</p> : null}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => startEditing(course)} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                    Edit
                  </button>
                  {course.approval_status === "rejected" ? (
                    <button
                      disabled={isBusy}
                      onClick={() => handleResubmit(course)}
                      className="rounded border border-amber-300 px-3 py-1.5 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                    >
                      {isBusy ? "Submitting..." : "Resubmit"}
                    </button>
                  ) : null}
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
      {error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
