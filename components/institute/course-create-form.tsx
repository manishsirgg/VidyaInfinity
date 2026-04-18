"use client";

import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";

type SubmitState = "idle" | "submitting" | "success" | "error";

function hasAtLeastOneImageAndVideo(files: File[]) {
  const hasImage = files.some((file) => file.type.startsWith("image/"));
  const hasVideo = files.some((file) => file.type.startsWith("video/"));
  return hasImage && hasVideo;
}

export function CourseCreateForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [dates, setDates] = useState({ startDate: "", endDate: "", admissionDeadline: "" });

  const dateError = useMemo(() => {
    if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
      return "End date cannot be earlier than start date.";
    }
    if (dates.admissionDeadline && dates.startDate && dates.admissionDeadline > dates.startDate) {
      return "Admission deadline should be on or before the course start date.";
    }
    return "";
  }, [dates]);

  const mediaError = useMemo(() => {
    if (mediaFiles.length === 0) return "Upload course media with at least one image and one video.";
    if (!hasAtLeastOneImageAndVideo(mediaFiles)) return "Upload at least one image file and one video file.";
    return "";
  }, [mediaFiles]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (dateError || mediaError) {
      setState("error");
      setError(dateError || mediaError || "Please fix form errors before submitting.");
      return;
    }

    setState("submitting");
    try {
      const formData = new FormData(event.currentTarget);
      formData.delete("mediaFiles");

      const createResponse = await fetch("/api/institute/courses", {
        method: "POST",
        body: formData,
      });

      const createBody = await createResponse.json().catch(() => null);
      if (!createResponse.ok || !createBody?.courseId) {
        setState("error");
        setError(createBody?.error ?? "Failed to submit course");
        return;
      }

      const courseId = String(createBody.courseId);

      for (const file of mediaFiles) {
        const mediaPayload = new FormData();
        mediaPayload.append("file", file);

        const mediaResponse = await fetch(`/api/institute/courses/${courseId}/media`, {
          method: "POST",
          body: mediaPayload,
        });

        if (!mediaResponse.ok) {
          const mediaBody = await mediaResponse.json().catch(() => null);
          await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" }).catch(() => undefined);
          setState("error");
          setError(mediaBody?.error ?? "Failed to upload course media");
          return;
        }
      }

      setState("success");
      setMessage("Course submitted for admin approval.");
      setMediaFiles([]);
      setDates({ startDate: "", endDate: "", admissionDeadline: "" });
      event.currentTarget.reset();
    } catch {
      setState("error");
      setError("Failed to submit course");
    }
  }

  return (
    <form id="create-course" onSubmit={onSubmit} className="mt-4 grid gap-4 rounded border bg-white p-4 md:p-5">
      <div className="rounded border border-brand-100 bg-brand-50/30 p-3">
        <h2 className="text-lg font-semibold">Add a new course</h2>
        <p className="mt-1 text-sm text-slate-700">
          Fill this form once to publish a new course listing for admin review.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
          <li>
            <span className="font-medium">Start date:</span> First class/session date shown to students.
          </li>
          <li>
            <span className="font-medium">End date:</span> Expected completion date (optional but recommended).
          </li>
          <li>
            <span className="font-medium">Admission deadline:</span> Last date when students can enroll.
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1) Course basics</h3>
        <input name="title" required placeholder="Course title" className="w-full rounded border px-3 py-2" />
        <input name="summary" required placeholder="Short summary" className="w-full rounded border px-3 py-2" />
        <textarea
          name="description"
          required
          placeholder="Detailed course description"
          className="min-h-24 w-full rounded border px-3 py-2"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input name="category" required placeholder="Category (e.g. Engineering Entrance)" className="rounded border px-3 py-2" />
        <input name="subcategory" placeholder="Subcategory (e.g. JEE Main)" className="rounded border px-3 py-2" />
        <select name="courseLevel" required className="rounded border px-3 py-2">
          <option value="">Select course level</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <input name="language" required placeholder="Language (e.g. English/Hindi)" className="rounded border px-3 py-2" />
        <select name="deliveryMode" required className="rounded border px-3 py-2">
          <option value="">Delivery mode</option>
          <option value="online_live">Online Live</option>
          <option value="online_recorded">Online Recorded</option>
          <option value="offline_classroom">Offline Classroom</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <input name="feeAmount" type="number" min={0} required placeholder="Course fee amount" className="rounded border px-3 py-2" />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">2) Batch setup and important dates</h3>
        <p className="text-xs text-slate-600">
          These dates control listing visibility and enrollment planning. Use them carefully.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input name="durationValue" required type="number" min={1} placeholder="Duration value" className="rounded border px-3 py-2" />
        <select name="durationUnit" required className="rounded border px-3 py-2">
          <option value="">Duration unit</option>
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
          <option value="years">Years</option>
        </select>
        <input name="weeklySchedule" required placeholder="Weekly schedule (e.g. Mon-Fri 7-9 PM)" className="rounded border px-3 py-2" />
        <input
          name="startDate"
          required
          type="date"
          aria-label="Course start date"
          title="Start date: first class/session date."
          className="rounded border px-3 py-2"
          value={dates.startDate}
          onChange={(event) => setDates((prev) => ({ ...prev, startDate: event.target.value }))}
        />
        <input
          name="endDate"
          type="date"
          aria-label="Course end date"
          title="End date: expected completion date."
          className="rounded border px-3 py-2"
          value={dates.endDate}
          onChange={(event) => setDates((prev) => ({ ...prev, endDate: event.target.value }))}
        />
        <input
          name="admissionDeadline"
          type="date"
          aria-label="Admission deadline"
          title="Admission deadline: last day students can enroll."
          className="rounded border px-3 py-2"
          value={dates.admissionDeadline}
          onChange={(event) => setDates((prev) => ({ ...prev, admissionDeadline: event.target.value }))}
        />
      </div>
      <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
        <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1">Start date: course goes live for actual classes.</p>
        <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1">End date: helps learners estimate course commitment.</p>
        <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1">Admission deadline: blocks late enrollments after this date.</p>
      </div>

      {dateError ? <FormFeedback tone="error">{dateError}</FormFeedback> : null}

      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">3) Curriculum and learner fit</h3>
      <textarea name="eligibility" required placeholder="Eligibility criteria" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="prerequisites" placeholder="Prerequisites" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="learningOutcomes" required placeholder="Learning outcomes" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="targetAudience" placeholder="Target audience" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="syllabus" required placeholder="Detailed syllabus / curriculum" className="min-h-28 rounded border px-3 py-2" />

      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">4) Pricing, certification, and support</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <select name="certificateAvailable" className="rounded border px-3 py-2">
          <option value="no">Certificate not available</option>
          <option value="yes">Certificate available</option>
        </select>
        <input name="certificationDetails" placeholder="Certification details" className="rounded border px-3 py-2" />
        <input name="totalSeats" type="number" min={1} placeholder="Total seats" className="rounded border px-3 py-2" />
        <input name="demoVideoUrl" placeholder="Demo video URL" className="rounded border px-3 py-2" />
        <input name="brochureUrl" placeholder="Brochure URL" className="rounded border px-3 py-2" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input name="instructorName" placeholder="Instructor / Faculty name" className="rounded border px-3 py-2" />
        <input name="instructorQualification" placeholder="Instructor qualification" className="rounded border px-3 py-2" />
        <input name="supportEmail" type="email" placeholder="Support email" className="rounded border px-3 py-2" />
        <input name="supportPhone" placeholder="Support phone" className="rounded border px-3 py-2" />
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">5) Media upload</h3>
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium">Course media (required)</p>
        <p className="text-xs text-slate-600">Upload multiple files and include at least 1 image and 1 video.</p>
        <input
          type="file"
          name="mediaFiles"
          multiple
          required
          accept="image/png,image/jpeg,image/webp,video/mp4"
          className="mt-2 rounded border bg-white px-3 py-2"
          onChange={(event) => setMediaFiles(Array.from(event.target.files ?? []))}
        />
        {mediaFiles.length > 0 ? <p className="mt-2 text-xs text-slate-600">{mediaFiles.length} file(s) selected.</p> : null}
      </div>

      {mediaError ? <FormFeedback tone="warning">{mediaError}</FormFeedback> : null}

      <button type="submit" disabled={state === "submitting"} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60">
        {state === "submitting" ? "Submitting..." : "Submit Course for Admin Approval"}
      </button>

      {state === "success" && message ? <FormFeedback tone="success">{message}</FormFeedback> : null}
      {state === "error" && error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
