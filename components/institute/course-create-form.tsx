"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";
import { createClient } from "@/lib/supabase/client";

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

const MAX_MEDIA_FILES = 10;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

const FORM_STEPS = [
  "Basic course information",
  "Delivery, schedule & timeline",
  "Admissions & learner outcomes",
  "Certification, pricing & support",
  "Course media",
] as const;

type FileKind = "image" | "video" | null;

function getFileKind(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension)) return "video";

  return null;
}

function hasAnyMedia(files: File[]) {
  return files.some((file) => getFileKind(file) !== null);
}

function getMediaValidationError(files: File[]) {
  if (files.length === 0) return "Upload at least one course image or video.";
  if (files.length > MAX_MEDIA_FILES) return `You can upload a maximum of ${MAX_MEDIA_FILES} media files.`;
  if (!hasAnyMedia(files)) return "Only image/video files are allowed for course media.";
  const oversizedFile = files.find((file) => {
    const kind = getFileKind(file);
    if (kind === "image") return file.size > MAX_IMAGE_SIZE_BYTES;
    if (kind === "video") return file.size > MAX_VIDEO_SIZE_BYTES;
    return true;
  });

  if (!oversizedFile) return "";

  if (getFileKind(oversizedFile) === "image") {
    return `"${oversizedFile.name}" is too large. Image files must be 10MB or smaller.`;
  }
  if (getFileKind(oversizedFile) === "video") {
    return `"${oversizedFile.name}" is too large. Video files must be 50MB or smaller.`;
  }
  return `Unsupported media type for "${oversizedFile.name}".`;
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
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
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

  const mediaError = useMemo(() => getMediaValidationError(mediaFiles), [mediaFiles]);

  const descriptionError = useMemo(() => {
    if (descriptionWordCount > 3000) {
      return "Course details must be 3000 words or fewer.";
    }
    return "";
  }, [descriptionWordCount]);

  function validateStep(step: number, form: HTMLFormElement) {
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `[data-step=\"${step}\"] input, [data-step=\"${step}\"] select, [data-step=\"${step}\"] textarea`,
    );

    for (const field of fields) {
      if (!field.checkValidity()) {
        setCurrentStep(step);
        field.reportValidity();
        return false;
      }
    }

    return true;
  }

  function goToNextStep() {
    const form = formRef.current;
    if (!form) return;

    if (!validateStep(currentStep, form)) return;
    if (currentStep === 1 && dateError) {
      setError(dateError);
      return;
    }
    if (currentStep === 4 && mediaError) {
      setError(mediaError);
      return;
    }

    setError("");
    setCurrentStep((prev) => Math.min(prev + 1, FORM_STEPS.length - 1));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const mediaInput = event.currentTarget.elements.namedItem("mediaFiles");
    const inputFiles = mediaInput instanceof HTMLInputElement ? Array.from(mediaInput.files ?? []) : [];
    const selectedMediaFiles = mediaFiles.length > 0 ? mediaFiles : inputFiles;
    const submitMediaError = getMediaValidationError(selectedMediaFiles);

    for (let step = 0; step < FORM_STEPS.length; step += 1) {
      if (!validateStep(step, event.currentTarget)) {
        setState("error");
        setError("Please complete all required fields before submitting.");
        return;
      }
    }

    if (dateError || submitMediaError || descriptionError) {
      setState("error");
      setMediaFiles(selectedMediaFiles);
      setError(dateError || submitMediaError || descriptionError || "Please fix form errors before submitting.");
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

      const supabase = createClient();

      for (const file of selectedMediaFiles) {
        const fileType = file.type || (getFileKind(file) === "image" ? "image/jpeg" : "video/mp4");

        const signedResponse = await fetch(`/api/institute/courses/${courseId}/media/signed-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType, fileSize: file.size }),
        });

        const signedBody = (await signedResponse.json().catch(() => null)) as
          | { error?: string; token?: string; path?: string; publicUrl?: string }
          | null;

        if (!signedResponse.ok || !signedBody?.token || !signedBody.path) {
          await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" }).catch(() => undefined);
          setState("error");
          setError(signedBody?.error ?? `Failed to prepare upload for "${file.name}".`);
          return;
        }

        const { error: storageError } = await supabase.storage
          .from("course-media")
          .uploadToSignedUrl(signedBody.path, signedBody.token, file, {
            contentType: fileType,
          });

        if (storageError) {
          await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" }).catch(() => undefined);
          setState("error");
          setError(`Upload failed for "${file.name}": ${storageError.message}`);
          return;
        }

        const mediaResponse = await fetch(`/api/institute/courses/${courseId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: signedBody.path,
            publicUrl: signedBody.publicUrl,
            fileType,
          }),
        });

        if (!mediaResponse.ok) {
          const errorText = await mediaResponse.text().catch(() => "");
          let mediaBody: { error?: string } | null = null;
          if (errorText) {
            try {
              mediaBody = JSON.parse(errorText) as { error?: string };
            } catch {
              mediaBody = null;
            }
          }
          const detailedError =
            mediaBody?.error || errorText || `Failed to register "${file.name}" (HTTP ${mediaResponse.status})`;
          await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" }).catch(() => undefined);
          setState("error");
          setError(detailedError);
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
      setCurrentStep(0);
      event.currentTarget.reset();
    } catch {
      setState("error");
      setError("Failed to submit course");
    }
  }

  return (
    <form id="create-course" ref={formRef} onSubmit={onSubmit} noValidate className="mt-4 space-y-5 rounded border bg-white p-4 md:p-6">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold">Add a new course</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fields marked with <span className="text-rose-600">*</span> are required.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {FORM_STEPS.map((label, index) => {
          const isActive = index === currentStep;
          const isDone = index < currentStep;

          return (
            <button
              key={label}
              type="button"
              onClick={() => setCurrentStep(index)}
              className={`rounded border px-3 py-2 text-left text-xs sm:text-sm ${
                isActive
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-700"
                  : isDone
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span className="block text-[11px] uppercase tracking-wide opacity-70">Step {index + 1}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <section data-step="0" className={currentStep === 0 ? "space-y-3 rounded-lg border border-slate-200 p-4" : "hidden"}>
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
            Subcategory
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

      <section data-step="1" className={currentStep === 1 ? "space-y-3 rounded-lg border border-slate-200 p-4" : "hidden"}>
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

      <section data-step="2" className={currentStep === 2 ? "space-y-3 rounded-lg border border-slate-200 p-4" : "hidden"}>
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

      <section data-step="3" className={currentStep === 3 ? "space-y-3 rounded-lg border border-slate-200 p-4" : "hidden"}>
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

      <section data-step="4" className={currentStep === 4 ? "space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4" : "hidden"}>
        <h3 className="text-base font-semibold text-slate-900">Course media</h3>
        <p className="text-sm text-slate-600">At least one image or video is required. Upload quality media for better conversions.</p>
        <input
          type="file"
          name="mediaFiles"
          multiple
          required
          accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="rounded border bg-white px-3 py-2"
          onChange={(event) => setMediaFiles(Array.from(event.target.files ?? []))}
        />
        <p className="text-xs text-slate-500">Upload up to 10 files. Images: max 10MB each. Videos: max 50MB each.</p>
        {mediaFiles.length > 0 ? <p className="text-xs text-slate-600">{mediaFiles.length} file(s) selected.</p> : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))}
          disabled={currentStep === 0 || state === "submitting"}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Previous
        </button>

        {currentStep < FORM_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goToNextStep}
            disabled={state === "submitting"}
            className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            Save & Next
          </button>
        ) : (
          <button type="submit" disabled={state === "submitting"} className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-60">
            {state === "submitting" ? "Submitting..." : "Submit Course for Admin Approval"}
          </button>
        )}
      </div>

      {dateError ? <FormFeedback tone="error">{dateError}</FormFeedback> : null}
      {descriptionError ? <FormFeedback tone="error">{descriptionError}</FormFeedback> : null}
      {mediaError ? <FormFeedback tone="warning">{mediaError}</FormFeedback> : null}
      {state === "success" && message ? <FormFeedback tone="success">{message}</FormFeedback> : null}
      {state === "error" && error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
