"use client";

import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";

type SubmitState = "idle" | "submitting" | "success" | "error";

function hasAnyMedia(files: File[]) {
  return files.some((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
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
    if (mediaFiles.length === 0) return "Upload at least one course image or video.";
    if (!hasAnyMedia(mediaFiles)) return "Only image/video files are allowed for course media.";
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
      <h2 className="text-lg font-semibold">Add a new course</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <input name="title" required placeholder="Course title" className="rounded border px-3 py-2" />
        <input name="summary" placeholder="Short summary" className="rounded border px-3 py-2" />
        <textarea name="description" placeholder="Detailed description" className="min-h-24 rounded border px-3 py-2 md:col-span-2" />

        <input name="category" placeholder="Category" className="rounded border px-3 py-2" />
        <input name="subject" placeholder="Subject" className="rounded border px-3 py-2" />
        <input name="level" placeholder="Level" className="rounded border px-3 py-2" />
        <input name="language" placeholder="Language" className="rounded border px-3 py-2" />
        <input name="fees" type="number" min={0} required placeholder="Fees" className="rounded border px-3 py-2" />

        <select name="mode" required className="rounded border px-3 py-2">
          <option value="">Course mode</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="hybrid">Hybrid</option>
        </select>

        <input name="location" placeholder="Location (if offline/hybrid)" className="rounded border px-3 py-2" />

        <input name="durationValue" type="number" min={1} placeholder="Duration value" className="rounded border px-3 py-2" />
        <input name="durationUnit" placeholder="Duration unit (days/weeks/months)" className="rounded border px-3 py-2" />
        <input name="duration" required placeholder="Duration text (e.g. 6 months)" className="rounded border px-3 py-2" />
        <input name="schedule" placeholder="Schedule" className="rounded border px-3 py-2" />

        <input
          name="startDate"
          type="date"
          className="rounded border px-3 py-2"
          value={dates.startDate}
          onChange={(event) => setDates((prev) => ({ ...prev, startDate: event.target.value }))}
        />
        <input
          name="endDate"
          type="date"
          className="rounded border px-3 py-2"
          value={dates.endDate}
          onChange={(event) => setDates((prev) => ({ ...prev, endDate: event.target.value }))}
        />
        <input
          name="admissionDeadline"
          type="date"
          className="rounded border px-3 py-2"
          value={dates.admissionDeadline}
          onChange={(event) => setDates((prev) => ({ ...prev, admissionDeadline: event.target.value }))}
        />

        <textarea name="eligibility" placeholder="Eligibility" className="min-h-20 rounded border px-3 py-2" />
        <textarea name="learningOutcomes" placeholder="Learning outcomes" className="min-h-20 rounded border px-3 py-2" />
        <textarea name="targetAudience" placeholder="Target audience" className="min-h-20 rounded border px-3 py-2 md:col-span-2" />

        <input name="certificateStatus" placeholder="Certificate status" className="rounded border px-3 py-2" />
        <input name="certificateDetails" placeholder="Certificate details" className="rounded border px-3 py-2" />
        <input name="batchSize" type="number" min={0} placeholder="Batch size" className="rounded border px-3 py-2" />
        <input name="placementSupport" placeholder="Placement support" className="rounded border px-3 py-2" />
        <input name="internshipSupport" placeholder="Internship support" className="rounded border px-3 py-2" />
        <input name="facultyName" placeholder="Faculty name" className="rounded border px-3 py-2" />
        <input name="facultyQualification" placeholder="Faculty qualification" className="rounded border px-3 py-2" />
        <input name="supportEmail" type="email" placeholder="Support email" className="rounded border px-3 py-2" />
        <input name="supportPhone" placeholder="Support phone" className="rounded border px-3 py-2" />
      </div>

      {dateError ? <FormFeedback tone="error">{dateError}</FormFeedback> : null}

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium">Course media</p>
        <input
          type="file"
          name="mediaFiles"
          multiple
          required
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
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
