"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InstituteCourseRecord } from "@/lib/institute/course-queries";

export function ManageCourseCards({ courses }: { courses: InstituteCourseRecord[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function deleteCourse(courseId: string) {
    if (!window.confirm("Delete this course permanently?")) return;
    setError("");
    setBusyId(courseId);
    const response = await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyId(null);

    if (!response.ok) {
      setError(body?.error ?? "Failed to delete course.");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <div className="mt-6 space-y-4">
        {courses.map((course) => (
          <article key={course.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{course.title}</h2>
                <p className="text-sm text-slate-600">Status: {course.status} · Fee: ₹{course.fees}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/institute/courses/${course.id}/edit`} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Edit full details</Link>
                <button disabled={busyId === course.id} onClick={() => deleteCourse(course.id)} className="rounded border border-rose-300 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-60">
                  {busyId === course.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="text-slate-500">Category</dt><dd>{course.category ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Subcategory</dt><dd>{course.subject ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Level</dt><dd>{course.level ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Mode</dt><dd>{course.mode ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Duration</dt><dd>{course.duration ?? "-"}</dd></div>
              <div><dt className="text-slate-500">Start date</dt><dd>{course.start_date ?? "-"}</dd></div>
              <div className="md:col-span-2"><dt className="text-slate-500">Summary</dt><dd>{course.summary ?? "-"}</dd></div>
            </dl>
            {course.rejection_reason ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Rejection reason: {course.rejection_reason}</p> : null}
          </article>
        ))}
      </div>
      {courses.length === 0 ? <p className="mt-4 text-sm text-slate-600">No courses found.</p> : null}
      {error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </>
  );
}
