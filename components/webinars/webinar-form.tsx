"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

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
  facultyName: string;
  facultyBio: string;
  thumbnailUrl: string;
  bannerUrl: string;
  maxAttendees: number;
  learningPoints: string;
};

type MediaKind = "thumbnail" | "banner";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function isValidImageFile(file: File) {
  if (!file.type.startsWith("image/")) return "Please upload image files only.";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return "Image must be 10MB or smaller.";
  return "";
}

export function WebinarForm({ mode, webinarId, initialValues }: { mode: "create" | "edit"; webinarId?: string; initialValues?: Partial<WebinarFormValues> }) {
  const router = useRouter();
  const supabase = createClient();
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
    facultyName: initialValues?.facultyName ?? "",
    facultyBio: initialValues?.facultyBio ?? "",
    thumbnailUrl: initialValues?.thumbnailUrl ?? "",
    bannerUrl: initialValues?.bannerUrl ?? "",
    maxAttendees: initialValues?.maxAttendees ?? 0,
    learningPoints: initialValues?.learningPoints ?? "",
  });
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const thumbnailPreview = useMemo(() => (thumbnailFile ? URL.createObjectURL(thumbnailFile) : values.thumbnailUrl), [thumbnailFile, values.thumbnailUrl]);
  const bannerPreview = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : values.bannerUrl), [bannerFile, values.bannerUrl]);


  useEffect(() => {
    if (!thumbnailFile) return;
    return () => URL.revokeObjectURL(thumbnailPreview);
  }, [thumbnailFile, thumbnailPreview]);

  useEffect(() => {
    if (!bannerFile) return;
    return () => URL.revokeObjectURL(bannerPreview);
  }, [bannerFile, bannerPreview]);

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
    if (thumbnailFile) {
      const mediaError = isValidImageFile(thumbnailFile);
      if (mediaError) return `Thumbnail: ${mediaError}`;
    }
    if (bannerFile) {
      const mediaError = isValidImageFile(bannerFile);
      if (mediaError) return `Banner: ${mediaError}`;
    }
    return "";
  }, [values, thumbnailFile, bannerFile]);

  const durationHint = useMemo(() => {
    if (!values.startsAt || !values.endsAt) return "";
    const start = new Date(values.startsAt);
    const end = new Date(values.endsAt);
    const diffMs = end.getTime() - start.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) return "";
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} min session`;
    if (!minutes) return `${hours} hr session`;
    return `${hours} hr ${minutes} min session`;
  }, [values.endsAt, values.startsAt]);

  async function uploadImage(file: File, kind: MediaKind) {
    const signedResponse = await fetch("/api/institute/webinars/media/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, kind }),
    });

    const signedBody = (await signedResponse.json().catch(() => null)) as { error?: string; token?: string; path?: string; publicUrl?: string } | null;
    if (!signedResponse.ok || !signedBody?.token || !signedBody.path) {
      throw new Error(signedBody?.error ?? `Unable to prepare ${kind} upload.`);
    }

    const { error: uploadError } = await supabase.storage.from("institute-media").uploadToSignedUrl(signedBody.path, signedBody.token, file, { contentType: file.type });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    return signedBody.publicUrl ?? "";
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const nextThumbnailUrl = thumbnailFile ? await uploadImage(thumbnailFile, "thumbnail") : values.thumbnailUrl;
      const nextBannerUrl = bannerFile ? await uploadImage(bannerFile, "banner") : values.bannerUrl;

      const endpoint = mode === "create" ? "/api/institute/webinars" : `/api/institute/webinars/${webinarId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, thumbnailUrl: nextThumbnailUrl, bannerUrl: nextBannerUrl }),
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
    } catch (uploadError) {
      setSubmitting(false);
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    }
  }

  const fieldClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900">Basic details</h2>
        <p className="mt-1 text-xs text-slate-500">Start with the essentials your learners see first.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Webinar title *</label>
            <input className={fieldClass} placeholder="e.g. Crack CAT Quant in 60 days" value={values.title} onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Webinar type *</label>
            <select className={fieldClass} value={values.webinarMode} onChange={(event) => setValues((prev) => ({ ...prev, webinarMode: event.target.value === "paid" ? "paid" : "free", price: event.target.value === "paid" ? Math.max(prev.price, 1) : 0 }))}>
              <option value="free">Free webinar</option>
              <option value="paid">Paid webinar</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Max attendees</label>
            <input className={fieldClass} type="number" min={0} placeholder="Unlimited if 0" value={values.maxAttendees} onChange={(event) => setValues((prev) => ({ ...prev, maxAttendees: Number(event.target.value) }))} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Description *</label>
            <textarea rows={4} className={fieldClass} placeholder="Explain who this webinar is for and what problem it solves." value={values.description} onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>What students will learn</label>
            <textarea rows={3} className={fieldClass} placeholder="Add 3-5 outcomes, separated by commas or new lines." value={values.learningPoints} onChange={(event) => setValues((prev) => ({ ...prev, learningPoints: event.target.value }))} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900">Schedule & delivery</h2>
        <p className="mt-1 text-xs text-slate-500">Set time, meeting details, and timezone clearly.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Start date & time *</label>
            <input type="datetime-local" className={fieldClass} value={values.startsAt} onChange={(event) => setValues((prev) => ({ ...prev, startsAt: event.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>End date & time</label>
            <input type="datetime-local" className={fieldClass} value={values.endsAt} onChange={(event) => setValues((prev) => ({ ...prev, endsAt: event.target.value }))} />
            {durationHint ? <p className="mt-1 text-xs text-slate-500">{durationHint}</p> : null}
          </div>
          <div>
            <label className={labelClass}>Timezone *</label>
            <input className={fieldClass} placeholder="Asia/Kolkata" value={values.timezone} onChange={(event) => setValues((prev) => ({ ...prev, timezone: event.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Google Meet URL</label>
            <input className={fieldClass} placeholder="https://meet.google.com/..." value={values.meetingUrl} onChange={(event) => setValues((prev) => ({ ...prev, meetingUrl: event.target.value }))} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900">Faculty & branding</h2>
        <p className="mt-1 text-xs text-slate-500">Add presenter and image details for a polished listing.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Faculty name</label>
            <input className={fieldClass} placeholder="Faculty name" value={values.facultyName} onChange={(event) => setValues((prev) => ({ ...prev, facultyName: event.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Faculty bio</label>
            <input className={fieldClass} placeholder="Short faculty bio" value={values.facultyBio} onChange={(event) => setValues((prev) => ({ ...prev, facultyBio: event.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Thumbnail image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={fieldClass}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) return;
                const mediaError = isValidImageFile(file);
                if (mediaError) {
                  setError(`Thumbnail: ${mediaError}`);
                  return;
                }
                setError("");
                setThumbnailFile(file);
              }}
            />
            {thumbnailPreview ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                <Image src={thumbnailPreview} alt="Thumbnail preview" width={320} height={180} className="h-32 w-full rounded object-cover" unoptimized />
              </div>
            ) : null}
            {values.thumbnailUrl || thumbnailFile ? (
              <button
                type="button"
                className="mt-2 text-xs text-rose-700 underline"
                onClick={() => {
                  setThumbnailFile(null);
                  setValues((prev) => ({ ...prev, thumbnailUrl: "" }));
                }}
              >
                Remove thumbnail
              </button>
            ) : null}
          </div>

          <div>
            <label className={labelClass}>Banner image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={fieldClass}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) return;
                const mediaError = isValidImageFile(file);
                if (mediaError) {
                  setError(`Banner: ${mediaError}`);
                  return;
                }
                setError("");
                setBannerFile(file);
              }}
            />
            {bannerPreview ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                <Image src={bannerPreview} alt="Banner preview" width={320} height={180} className="h-32 w-full rounded object-cover" unoptimized />
              </div>
            ) : null}
            {values.bannerUrl || bannerFile ? (
              <button
                type="button"
                className="mt-2 text-xs text-rose-700 underline"
                onClick={() => {
                  setBannerFile(null);
                  setValues((prev) => ({ ...prev, bannerUrl: "" }));
                }}
              >
                Remove banner
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900">Pricing</h2>
        <p className="mt-1 text-xs text-slate-500">Price is only required for paid webinars.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Currency</label>
            <input className={fieldClass} placeholder="INR" value={values.currency} onChange={(event) => setValues((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className={labelClass}>Price ({values.webinarMode === "paid" ? "required" : "optional"})</label>
            <input className={fieldClass} type="number" min={values.webinarMode === "paid" ? 1 : 0} value={values.price} onChange={(event) => setValues((prev) => ({ ...prev, price: Number(event.target.value) }))} />
          </div>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <button type="submit" disabled={submitting} className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? "Saving..." : mode === "create" ? "Schedule webinar" : "Save webinar"}
      </button>
    </form>
  );
}
