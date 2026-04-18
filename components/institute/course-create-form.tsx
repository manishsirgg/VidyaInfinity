"use client";

import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";

type SubmitState = "idle" | "submitting" | "success" | "error";

type DateState = {
  startDate: string;
  endDate: string;
  admissionDeadline: string;
};

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "all_levels", label: "All Levels" },
  { value: "foundation", label: "Foundation" },
  { value: "expert", label: "Expert" },
] as const;

const COURSE_MODE_OPTIONS = [
  { value: "online", label: "Online (Self-paced)" },
  { value: "live_online", label: "Live Online" },
  { value: "offline", label: "Offline / Classroom" },
  { value: "hybrid", label: "Hybrid" },
  { value: "blended", label: "Blended Learning" },
  { value: "weekend", label: "Weekend Batch" },
  { value: "bootcamp", label: "Bootcamp" },
] as const;

const DURATION_UNITS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
  { value: "hours", label: "Hours" },
] as const;

const CERTIFICATE_STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "not_available", label: "Not Available" },
  { value: "optional", label: "Optional / Add-on" },
  { value: "in_progress", label: "In Progress" },
] as const;

function hasAnyMedia(files: File[]) {
  return files.some((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
}

function requiredLabel(label: string) {
  return (
    <>
      {label} <span className="text-rose-600">*</span>
    </>
  );
}

function FieldHint({ children }: { children: string }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

export function CourseCreateForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [dates, setDates] = useState<DateState>({ startDate: "", endDate: "", admissionDeadline: "" });
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState("");
  const [description, setDescription] = useState("");

  const descriptionWordCount = useMemo(() => {
    if (!description.trim()) return 0;
    return description.trim().split(/\s+/).length;
  }, [description]);

  const computedDuration = useMemo(() => {
    if (!durationValue || !durationUnit) return "";
    return `${durationValue} ${durationUnit}`;
  }, [durationUnit, durationValue]);

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

  const descriptionError = useMemo(() => {
    if (descriptionWordCount > 3000) {
      return "Course details must be 3000 words or fewer.";
    }
    return "";
  }, [descriptionWordCount]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (dateError || mediaError || descriptionError) {
      setState("error");
      setError(dateError || mediaError || descriptionError || "Please fix form errors before submitting.");
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
      setDurationValue("");
      setDurationUnit("");
      setDescription("");
      event.currentTarget.reset();
    } catch {
      setState("error");
      setError("Failed to submit course");
    }
  }

  return (
    <form id="create-course" onSubmit={onSubmit} className="mt-4 space-y-5 rounded border bg-white p-4 md:p-6">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold">Add a new course</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fields marked with <span className="text-rose-600">*</span> are required.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Basic course information</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            {requiredLabel("Course title")}
            <input name="title" required placeholder="e.g. Spoken English Course" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Short summary
            <input name="summary" maxLength={220} placeholder="One-line value proposition" className="mt-1 w-full rounded border px-3 py-2" />
            <FieldHint>Keep it concise for course cards and search results.</FieldHint>
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Course details / description
            <textarea
              name="description"
              placeholder="Describe curriculum, format, outcomes, and tools covered"
              className="mt-1 min-h-32 w-full rounded border px-3 py-2"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-slate-500">Maximum 3000 words.</span>
              <span className={descriptionWordCount > 3000 ? "font-medium text-rose-600" : "text-slate-500"}>{descriptionWordCount}/3000 words</span>
            </div>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Category
            <input name="category" placeholder="e.g. Abroad Study" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Subject
            <input name="subject" placeholder="e.g. Language" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Level
            <select name="level" defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
              <option value="">Select level</option>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Language
            <input name="language" placeholder="e.g. English" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Delivery, schedule & timeline</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            {requiredLabel("Course mode")}
            <select name="mode" required defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
              <option value="">Select mode</option>
              {COURSE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldHint>Choose how the course is delivered to learners.</FieldHint>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Location (for offline / hybrid)
            <input name="location" placeholder="Campus / city / center" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            {requiredLabel("Duration value")}
            <input
              name="durationValue"
              type="number"
              min={1}
              required
              value={durationValue}
              onChange={(event) => setDurationValue(event.target.value)}
              placeholder="e.g. 10"
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            {requiredLabel("Duration unit")}
            <select
              name="durationUnit"
              required
              value={durationUnit}
              onChange={(event) => setDurationUnit(event.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              <option value="">Select unit</option>
              {DURATION_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <input type="hidden" name="duration" value={computedDuration} />

          <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 md:col-span-2">
            <span className="font-medium">Computed duration:</span> {computedDuration || "Fill value and unit to auto-generate duration."}
          </div>

          <label className="text-sm font-medium text-slate-700">
            Schedule
            <input name="schedule" placeholder="Mon-Fri, 7 PM - 9 PM" className="mt-1 w-full rounded border px-3 py-2" />
            <FieldHint>Describe class timing, weekday/weekend pattern, etc.</FieldHint>
          </label>

          <div className="rounded border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <p className="font-semibold">Date pickers explained</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>
                <span className="font-medium">Admission deadline:</span> Last date to apply.
              </li>
              <li>
                <span className="font-medium">Start date:</span> When classes begin.
              </li>
              <li>
                <span className="font-medium">End date:</span> Planned completion date.
              </li>
            </ul>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Admission deadline
            <input
              name="admissionDeadline"
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={dates.admissionDeadline}
              onChange={(event) => setDates((prev) => ({ ...prev, admissionDeadline: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Start date
            <input
              name="startDate"
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={dates.startDate}
              onChange={(event) => setDates((prev) => ({ ...prev, startDate: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            End date
            <input
              name="endDate"
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={dates.endDate}
              onChange={(event) => setDates((prev) => ({ ...prev, endDate: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Admissions & learner outcomes</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Eligibility
            <textarea name="eligibility" placeholder="Academic prerequisites, skills, or age criteria" className="mt-1 min-h-20 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Learning outcomes
            <textarea name="learningOutcomes" placeholder="What learners will be able to do after completion" className="mt-1 min-h-20 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Target audience
            <textarea name="targetAudience" placeholder="Who should enroll in this course" className="mt-1 min-h-20 w-full rounded border px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Certification, pricing & support</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            {requiredLabel("Course fee")}
            <input name="fees" type="number" min={0} required placeholder="e.g. 15000" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Certificate status
            <select name="certificateStatus" defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
              <option value="">Select status</option>
              {CERTIFICATE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Certificate details
            <input name="certificateDetails" placeholder="Type of certificate, issuing body, etc." className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Batch size
            <input name="batchSize" type="number" min={0} placeholder="e.g. 30" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Placement support
            <select name="placementSupport" defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Internship support
            <select name="internshipSupport" defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Faculty name
            <input name="facultyName" placeholder="Lead trainer / instructor" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Faculty qualification
            <input name="facultyQualification" placeholder="Qualification and years of experience" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Support email
            <input name="supportEmail" type="email" placeholder="support@institute.com" className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Support phone
            <input name="supportPhone" placeholder="Helpline number" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        </div>
      </section>

      {dateError ? <FormFeedback tone="error">{dateError}</FormFeedback> : null}
      {descriptionError ? <FormFeedback tone="error">{descriptionError}</FormFeedback> : null}

      <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-slate-900">Course media</h3>
        <p className="text-sm text-slate-600">At least one image or video is required. Upload quality media for better conversions.</p>
        <input
          type="file"
          name="mediaFiles"
          multiple
          required
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          className="rounded border bg-white px-3 py-2"
          onChange={(event) => setMediaFiles(Array.from(event.target.files ?? []))}
        />
        {mediaFiles.length > 0 ? <p className="text-xs text-slate-600">{mediaFiles.length} file(s) selected.</p> : null}
      </section>

      {mediaError ? <FormFeedback tone="warning">{mediaError}</FormFeedback> : null}

      <button type="submit" disabled={state === "submitting"} className="w-full rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60 md:w-auto">
        {state === "submitting" ? "Submitting..." : "Submit Course for Admin Approval"}
      </button>

      {state === "success" && message ? <FormFeedback tone="success">{message}</FormFeedback> : null}
      {state === "error" && error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
