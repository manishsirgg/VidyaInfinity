"use client";

import { FormEvent, useEffect, useState } from "react";

type Webinar = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  webinar_mode: "free" | "paid";
  price: number;
  meeting_url: string | null;
  registration_url: string | null;
  status: string;
};

export default function InstituteWebinarsPage() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"free" | "paid">("free");

  async function loadWebinars() {
    setLoading(true);
    const response = await fetch("/api/institute/webinars", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setWebinars(body.webinars ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadWebinars();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);

    const response = await fetch("/api/institute/webinars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        description: formData.get("description"),
        startsAt: formData.get("startsAt"),
        endsAt: formData.get("endsAt"),
        timezone: formData.get("timezone"),
        mode,
        price: Number(formData.get("price") ?? 0),
        meetingUrl: formData.get("meetingUrl"),
        registrationUrl: formData.get("registrationUrl"),
      }),
    });

    if (response.ok) {
      event.currentTarget.reset();
      setMode("free");
      await loadWebinars();
    }

    setSubmitting(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Live Webinars</h1>
      <p className="mt-2 text-sm text-slate-600">Schedule and conduct free or paid live webinars to attract high-intent student leads.</p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
        <input required name="title" placeholder="Webinar title" className="rounded border px-3 py-2 text-sm" />
        <select value={mode} onChange={(e) => setMode(e.target.value as "free" | "paid")} className="rounded border px-3 py-2 text-sm">
          <option value="free">Free webinar</option>
          <option value="paid">Paid webinar</option>
        </select>
        <input required type="datetime-local" name="startsAt" className="rounded border px-3 py-2 text-sm" />
        <input type="datetime-local" name="endsAt" className="rounded border px-3 py-2 text-sm" />
        <input name="timezone" defaultValue="Asia/Kolkata" className="rounded border px-3 py-2 text-sm" />
        <input name="price" type="number" min={mode === "paid" ? 1 : 0} step="1" defaultValue={0} className="rounded border px-3 py-2 text-sm" />
        <input name="meetingUrl" placeholder="Live meeting URL" className="rounded border px-3 py-2 text-sm" />
        <input name="registrationUrl" placeholder="Registration URL (optional)" className="rounded border px-3 py-2 text-sm" />
        <textarea name="description" placeholder="What students will learn" className="md:col-span-2 rounded border px-3 py-2 text-sm" rows={3} />
        <button disabled={submitting} className="md:col-span-2 rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-70" type="submit">
          {submitting ? "Saving..." : "Schedule webinar"}
        </button>
      </form>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Upcoming & past webinars</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading webinars...</p> : null}
        <div className="mt-3 grid gap-3">
          {webinars.map((item) => (
            <article key={item.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{item.title}</p>
              <p className="text-slate-600">{new Date(item.starts_at).toLocaleString()} · {item.webinar_mode === "paid" ? `Paid (₹${item.price})` : "Free"}</p>
              <p className="text-slate-600">Status: {item.status}</p>
            </article>
          ))}
          {!loading && webinars.length === 0 ? <p className="text-sm text-slate-500">No webinars scheduled yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
