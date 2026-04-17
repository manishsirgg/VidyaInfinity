"use client";

import { FormEvent, useState } from "react";

export function CourseCreateForm() {
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/institute/courses", {
      method: "POST",
      body: formData,
    });

    const body = await response.json();
    setMessage(response.ok ? "Course submitted for approval" : body.error ?? "Failed");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-2 rounded border bg-white p-3">
      <input name="title" required placeholder="Course title" className="rounded border px-2 py-1" />
      <input name="summary" required placeholder="Short summary" className="rounded border px-2 py-1" />
      <textarea name="description" placeholder="Description" className="rounded border px-2 py-1" />
      <input name="feeAmount" type="number" min={0} required placeholder="Fee amount" className="rounded border px-2 py-1" />
      <input type="file" name="media" className="rounded border px-2 py-1" />
      <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-white">
        Create Course
      </button>
      {message && <p className="text-xs text-slate-700">{message}</p>}
    </form>
  );
}
