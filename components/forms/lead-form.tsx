"use client";

import { FormEvent, useState } from "react";

export function LeadForm({ courseId }: { courseId: string }) {
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      message: formData.get("message"),
      courseId,
    };

    const response = await fetch("/api/leads", { method: "POST", body: JSON.stringify(payload) });
    if (response.ok) setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border bg-white p-4">
      <input required name="name" placeholder="Full name" className="rounded border px-3 py-2" />
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input required name="phone" placeholder="Phone" className="rounded border px-3 py-2" />
      <textarea name="message" placeholder="Optional message" className="rounded border px-3 py-2" />
      <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-white">
        Submit Lead
      </button>
      {done && <p className="text-sm text-emerald-700">Lead submitted. You can now contact the institute.</p>}
    </form>
  );
}
