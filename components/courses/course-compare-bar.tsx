"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ComparableCourse = {
  id: string;
  title: string;
};

const STORAGE_KEY = "vi-course-compare";
const MAX_COMPARE = 4;

function loadCompareIds() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveCompareIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function CourseCompareBar({ courses }: { courses: ComparableCourse[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(loadCompareIds());
  }, []);

  const selectedValid = useMemo(() => selected.filter((id) => courses.some((course) => course.id === id)), [courses, selected]);

  useEffect(() => {
    saveCompareIds(selectedValid);
  }, [selectedValid]);

  function toggle(courseId: string) {
    setSelected((prev) => {
      if (prev.includes(courseId)) return prev.filter((id) => id !== courseId);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, courseId];
    });
  }

  return (
    <div className="mb-4 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Compare courses (up to {MAX_COMPARE})</p>
          <p className="text-xs text-slate-600">Select up to four courses to compare them side by side.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setSelected([])}
            disabled={selectedValid.length === 0}
          >
            Clear
          </button>
          <Link
            href={selectedValid.length > 0 ? `/courses/compare?ids=${selectedValid.join(",")}` : "/courses/compare"}
            className="rounded bg-brand-600 px-3 py-2 text-xs text-white"
          >
            Compare {selectedValid.length}
          </Link>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <label key={course.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs text-slate-700">
            <input type="checkbox" checked={selectedValid.includes(course.id)} onChange={() => toggle(course.id)} />
            <span className="line-clamp-1">{course.title}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
