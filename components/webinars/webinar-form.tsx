"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WebinarFormValues = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  webinarMode: "free" | "paid";
  price: number;
  currency: string;
  meetingUrl: string;
  registrationUrl: string;
  facultyName: string;
  facultyBio: string;
  thumbnailUrl: string;
  bannerUrl: string;
  maxAttendees: number;
  learningPoints: string;
};

export function WebinarForm({ mode, webinarId, initialValues }: { mode: "create" | "edit"; webinarId?: string; initialValues?: Partial<WebinarFormValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<WebinarFormValues>({
    title: initialValues?.title ?? "",
    description: initialValues?.description ?? "",
    startsAt: initialValues?.startsAt ?? "",
    endsAt: initialValues?.endsAt ?? "",
    timezone: initialValues?.timezone ?? "Asia/Kolkata",
    webinarMode: initialValues?.webinarMode ?? "free",
    price: initialValues?.price ?? 0,
    currency: initialValues?.currency ?? "INR",
    meetingUrl: initialValues?.meetingUrl ?? "",
    registrationUrl: initialValues?.registrationUrl ?? "",
    facultyName: initialValues?.facultyName ?? "",
    facultyBio: initialValues?.facultyBio ?? "",
    thumbnailUrl: initialValues?.thumbnailUrl ?? "",
    bannerUrl: initialValues?.bannerUrl ?? "",
    maxAttendees: initialValues?.maxAttendees ?? 0,
    learningPoints: initialValues?.learningPoints ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const validationError = useMemo(() => {
    if (!values.title.trim()) return "Title is required.";
    if (!values.startsAt) return "Start date and time are required.";
    if (values.endsAt && new Date(values.endsAt).getTime() <= new Date(values.startsAt).getTime()) return "End date/time must be after start date/time.";
    if (values.webinarMode === "paid" && Number(values.price) <= 0) return "Paid webinar must have price greater than zero.";
    if (values.meetingUrl) {
      try {
        const parsed = new URL(values.meetingUrl);
        if (parsed.protocol !== "https:" || !parsed.hostname.includes("meet.google.com")) return "Meeting URL must be a valid Google Meet URL.";
      } catch {
        return "Meeting URL must be a valid URL.";
      }
    }
    return "";
  }, [values]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    const endpoint = mode === "create" ? "/api/institute/webinars" : `/api/institute/webinars/${webinarId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok) {
      setError(body?.error ?? "Failed to save webinar");
      return;
    }

    const id = mode === "create" ? body?.id : webinarId;
    router.push(id ? `/institute/webinars/${id}` : "/institute/webinars");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <input className="rounded border px-3 py-2 text-sm" placeholder="Webinar title" value={values.title} onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))} />
      <select className="rounded border px-3 py-2 text-sm" value={values.webinarMode} onChange={(event) => setValues((prev) => ({ ...prev, webinarMode: event.target.value === "paid" ? "paid" : "free", price: event.target.value === "paid" ? Math.max(prev.price, 1) : 0 }))}>
        <option value="free">Free webinar</option>
        <option value="paid">Paid webinar</option>
      </select>
      <input type="datetime-local" className="rounded border px-3 py-2 text-sm" value={values.startsAt} onChange={(event) => setValues((prev) => ({ ...prev, startsAt: event.target.value }))} />
      <input type="datetime-local" className="rounded border px-3 py-2 text-sm" value={values.endsAt} onChange={(event) => setValues((prev) => ({ ...prev, endsAt: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Timezone" value={values.timezone} onChange={(event) => setValues((prev) => ({ ...prev, timezone: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" type="number" min={values.webinarMode === "paid" ? 1 : 0} value={values.price} onChange={(event) => setValues((prev) => ({ ...prev, price: Number(event.target.value) }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Currency" value={values.currency} onChange={(event) => setValues((prev) => ({ ...prev, currency: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Google Meet URL" value={values.meetingUrl} onChange={(event) => setValues((prev) => ({ ...prev, meetingUrl: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Registration URL (optional)" value={values.registrationUrl} onChange={(event) => setValues((prev) => ({ ...prev, registrationUrl: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Faculty name" value={values.facultyName} onChange={(event) => setValues((prev) => ({ ...prev, facultyName: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Faculty bio" value={values.facultyBio} onChange={(event) => setValues((prev) => ({ ...prev, facultyBio: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Thumbnail URL" value={values.thumbnailUrl} onChange={(event) => setValues((prev) => ({ ...prev, thumbnailUrl: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" placeholder="Banner URL" value={values.bannerUrl} onChange={(event) => setValues((prev) => ({ ...prev, bannerUrl: event.target.value }))} />
      <input className="rounded border px-3 py-2 text-sm" type="number" min={0} placeholder="Max attendees" value={values.maxAttendees} onChange={(event) => setValues((prev) => ({ ...prev, maxAttendees: Number(event.target.value) }))} />
      <textarea rows={4} className="rounded border px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={values.description} onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))} />
      <textarea rows={3} className="rounded border px-3 py-2 text-sm md:col-span-2" placeholder="What students will learn" value={values.learningPoints} onChange={(event) => setValues((prev) => ({ ...prev, learningPoints: event.target.value }))} />

      {error ? <p className="text-sm text-rose-700 md:col-span-2">{error}</p> : null}
      <button type="submit" disabled={submitting} className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 md:col-span-2">
        {submitting ? "Saving..." : mode === "create" ? "Schedule webinar" : "Save webinar"}
      </button>
    </form>
  );
}
