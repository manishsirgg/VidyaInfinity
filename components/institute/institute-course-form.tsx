"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "@/components/shared/form-feedback";
import { createClient } from "@/lib/supabase/client";
import type { InstituteCourseMedia, InstituteCourseRecord } from "@/lib/institute/course-data";

type SubmitState = "idle" | "submitting" | "success" | "error";

const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "all_levels", "foundation", "expert"] as const;
const COURSE_MODE_OPTIONS = ["online", "live_online", "offline", "hybrid", "blended", "weekend", "bootcamp"] as const;
const DURATION_UNITS = ["days", "weeks", "months", "years", "hours"] as const;
const CERTIFICATE_STATUS_OPTIONS = ["available", "not_available", "optional", "in_progress"] as const;

const MAX_MEDIA_FILES = 10;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

type FileKind = "image" | "video" | null;

function getFileKind(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

function mediaError(files: File[]) {
  if (files.length > MAX_MEDIA_FILES) return `You can upload a maximum of ${MAX_MEDIA_FILES} media files at once.`;
  const oversized = files.find((file) => {
    const kind = getFileKind(file);
    if (kind === "image") return file.size > MAX_IMAGE_SIZE_BYTES;
    if (kind === "video") return file.size > MAX_VIDEO_SIZE_BYTES;
    return true;
  });
  if (!oversized) return "";
  return `Invalid media file: ${oversized.name}.`;
}

function parseBoolean(value: string): boolean | null {
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function getWordCount(value: string) {
  if (!value.trim()) return 0;
  return value.trim().split(/\s+/).length;
}

type Props = {
  mode: "create" | "edit" | "resubmit";
  submitEndpoint: string;
  submitMethod: "POST" | "PATCH";
  successMessage: string;
  submitLabel: string;
  initialCourse?: InstituteCourseRecord;
  initialMedia?: InstituteCourseMedia[];
};

export function InstituteCourseForm({ mode, submitEndpoint, submitMethod, successMessage, submitLabel, initialCourse, initialMedia = [] }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState(initialCourse?.description ?? "");
  const [durationValue, setDurationValue] = useState(String(initialCourse?.duration_value ?? ""));
  const [durationUnit, setDurationUnit] = useState(initialCourse?.duration_unit ?? "");
  const [newMedia, setNewMedia] = useState<File[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);

  const computedDuration = useMemo(() => {
    if (durationValue && durationUnit) return `${durationValue} ${durationUnit}`;
    return initialCourse?.duration ?? "";
  }, [durationUnit, durationValue, initialCourse?.duration]);

  const descriptionWords = useMemo(() => getWordCount(description), [description]);
  const currentMedia = useMemo(() => initialMedia.filter((item) => !removedMediaIds.includes(item.id)), [initialMedia, removedMediaIds]);

  async function uploadNewMedia(courseId: string) {
    const failures: string[] = [];

    for (const file of newMedia) {
      const kind = getFileKind(file);
      if (!kind) {
        failures.push(`Unsupported media: ${file.name}`);
        continue;
      }

      const fileType = file.type || (kind === "image" ? "image/jpeg" : "video/mp4");
      const signedResponse = await fetch(`/api/institute/courses/${courseId}/media/signed-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType, fileSize: file.size }),
      });
      const signedBody = (await signedResponse.json().catch(() => null)) as { error?: string; token?: string; path?: string; publicUrl?: string } | null;
      if (!signedResponse.ok || !signedBody?.token || !signedBody.path) {
        failures.push(signedBody?.error ?? `Unable to prepare media upload for ${file.name}`);
        continue;
      }

      const { error: uploadError } = await supabase.storage.from("course-media").uploadToSignedUrl(signedBody.path, signedBody.token, file, { contentType: fileType });
      if (uploadError) {
        failures.push(`Upload failed for ${file.name}: ${uploadError.message}`);
        continue;
      }

      const registerResponse = await fetch(`/api/institute/courses/${courseId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signedBody.path, publicUrl: signedBody.publicUrl, fileType }),
      });

      if (!registerResponse.ok) {
        const body = (await registerResponse.json().catch(() => null)) as { error?: string } | null;
        failures.push(body?.error ?? `Failed to register media ${file.name}`);
      }
    }

    return failures;
  }

  async function removeMarkedMedia(courseId: string) {
    for (const mediaId of removedMediaIds) {
      await fetch(`/api/institute/courses/${courseId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");
    setMessage("");

    if (descriptionWords > 3000) {
      setState("error");
      setError("Course details must be 3000 words or fewer.");
      return;
    }

    const uploadError = mediaError(newMedia);
    if (uploadError) {
      setState("error");
      setError(uploadError);
      return;
    }

    if (mode === "create" && newMedia.length === 0) {
      setState("error");
      setError("Upload at least one course image or video.");
      return;
    }

    if (mode !== "create" && currentMedia.length + newMedia.length === 0) {
      setState("error");
      setError("At least one course media file is required.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      title: String(formData.get("title") ?? "").trim(),
      summary: String(formData.get("summary") ?? "").trim(),
      description,
      category: String(formData.get("category") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      level: String(formData.get("level") ?? "").trim(),
      language: String(formData.get("language") ?? "").trim(),
      fees: String(formData.get("fees") ?? "").trim(),
      duration: computedDuration,
      durationValue,
      durationUnit,
      mode: String(formData.get("mode") ?? "").trim(),
      location: String(formData.get("location") ?? "").trim(),
      schedule: String(formData.get("schedule") ?? "").trim(),
      startDate: String(formData.get("startDate") ?? "").trim(),
      endDate: String(formData.get("endDate") ?? "").trim(),
      admissionDeadline: String(formData.get("admissionDeadline") ?? "").trim(),
      eligibility: String(formData.get("eligibility") ?? "").trim(),
      learningOutcomes: String(formData.get("learningOutcomes") ?? "").trim(),
      targetAudience: String(formData.get("targetAudience") ?? "").trim(),
      certificateStatus: String(formData.get("certificateStatus") ?? "").trim(),
      certificateDetails: String(formData.get("certificateDetails") ?? "").trim(),
      batchSize: String(formData.get("batchSize") ?? "").trim(),
      placementSupport: parseBoolean(String(formData.get("placementSupport") ?? "")),
      internshipSupport: parseBoolean(String(formData.get("internshipSupport") ?? "")),
      facultyName: String(formData.get("facultyName") ?? "").trim(),
      facultyQualification: String(formData.get("facultyQualification") ?? "").trim(),
      supportEmail: String(formData.get("supportEmail") ?? "").trim(),
      supportPhone: String(formData.get("supportPhone") ?? "").trim(),
    };

    const body = submitMethod === "POST" && mode === "create" ? formData : JSON.stringify(payload);
    const headers = submitMethod === "POST" && mode === "create" ? undefined : { "Content-Type": "application/json" };

    const response = await fetch(submitEndpoint, { method: submitMethod, body, headers });
    const responseBody = (await response.json().catch(() => null)) as { error?: string; courseId?: string } | null;

    if (!response.ok) {
      setState("error");
      setError(responseBody?.error ?? "Failed to save course.");
      return;
    }

    const courseId = initialCourse?.id ?? responseBody?.courseId;
    if (!courseId) {
      setState("error");
      setError("Could not resolve course id for media operations.");
      return;
    }

    await removeMarkedMedia(courseId);
    const mediaFailures = await uploadNewMedia(courseId);

    setState(mediaFailures.length ? "error" : "success");
    setMessage(successMessage);

    if (mediaFailures.length) {
      setError(mediaFailures[0] ?? "Some media actions failed.");
    }

    router.push(`/institute/courses/${courseId}`);
    router.refresh();
  }

  const pageTitle = mode === "create" ? "Add a new course" : mode === "resubmit" ? "Resubmit rejected course" : "Edit course";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border bg-white p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">{pageTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">All edits are sent for moderation approval.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input name="title" required defaultValue={initialCourse?.title ?? ""} placeholder="Course title" className="rounded border px-3 py-2" />
        <input name="summary" defaultValue={initialCourse?.summary ?? ""} placeholder="Short summary" className="rounded border px-3 py-2" />
        <textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="min-h-28 rounded border px-3 py-2 md:col-span-2" />
        <input name="category" defaultValue={initialCourse?.category ?? ""} placeholder="Category" className="rounded border px-3 py-2" />
        <input name="subject" defaultValue={initialCourse?.subject ?? ""} placeholder="Subject" className="rounded border px-3 py-2" />
        <select name="level" defaultValue={initialCourse?.level ?? ""} className="rounded border px-3 py-2"><option value="">Level</option>{LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <input name="language" defaultValue={initialCourse?.language ?? ""} placeholder="Language" className="rounded border px-3 py-2" />
        <input name="fees" type="number" min={0} required defaultValue={initialCourse?.fees ?? 0} placeholder="Fees" className="rounded border px-3 py-2" />
        <select name="mode" required defaultValue={initialCourse?.mode ?? ""} className="rounded border px-3 py-2"><option value="">Mode</option>{COURSE_MODE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <input name="durationValue" required type="number" min={1} value={durationValue} onChange={(event) => setDurationValue(event.target.value)} placeholder="Duration value" className="rounded border px-3 py-2" />
        <select name="durationUnit" required value={durationUnit} onChange={(event) => setDurationUnit(event.target.value)} className="rounded border px-3 py-2"><option value="">Duration unit</option>{DURATION_UNITS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <input name="location" defaultValue={initialCourse?.location ?? ""} placeholder="Location" className="rounded border px-3 py-2" />
        <input name="schedule" defaultValue={initialCourse?.schedule ?? ""} placeholder="Schedule" className="rounded border px-3 py-2" />
        <input name="admissionDeadline" type="date" defaultValue={initialCourse?.admission_deadline ?? ""} className="rounded border px-3 py-2" />
        <input name="startDate" type="date" defaultValue={initialCourse?.start_date ?? ""} className="rounded border px-3 py-2" />
        <input name="endDate" type="date" defaultValue={initialCourse?.end_date ?? ""} className="rounded border px-3 py-2" />
        <textarea name="eligibility" defaultValue={initialCourse?.eligibility ?? ""} placeholder="Eligibility" className="min-h-20 rounded border px-3 py-2" />
        <textarea name="learningOutcomes" defaultValue={initialCourse?.learning_outcomes ?? ""} placeholder="Learning outcomes" className="min-h-20 rounded border px-3 py-2" />
        <textarea name="targetAudience" defaultValue={initialCourse?.target_audience ?? ""} placeholder="Target audience" className="min-h-20 rounded border px-3 py-2 md:col-span-2" />
        <select name="certificateStatus" defaultValue={initialCourse?.certificate_status ?? ""} className="rounded border px-3 py-2"><option value="">Certificate status</option>{CERTIFICATE_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <input name="certificateDetails" defaultValue={initialCourse?.certificate_details ?? ""} placeholder="Certificate details" className="rounded border px-3 py-2" />
        <input name="batchSize" type="number" min={0} defaultValue={initialCourse?.batch_size ?? ""} placeholder="Batch size" className="rounded border px-3 py-2" />
        <select name="placementSupport" defaultValue={initialCourse?.placement_support === null ? "" : String(initialCourse?.placement_support)} className="rounded border px-3 py-2"><option value="">Placement support</option><option value="true">Yes</option><option value="false">No</option></select>
        <select name="internshipSupport" defaultValue={initialCourse?.internship_support === null ? "" : String(initialCourse?.internship_support)} className="rounded border px-3 py-2"><option value="">Internship support</option><option value="true">Yes</option><option value="false">No</option></select>
        <input name="facultyName" defaultValue={initialCourse?.faculty_name ?? ""} placeholder="Faculty name" className="rounded border px-3 py-2" />
        <input name="facultyQualification" defaultValue={initialCourse?.faculty_qualification ?? ""} placeholder="Faculty qualification" className="rounded border px-3 py-2" />
        <input name="supportEmail" type="email" defaultValue={initialCourse?.support_email ?? ""} placeholder="Support email" className="rounded border px-3 py-2" />
        <input name="supportPhone" defaultValue={initialCourse?.support_phone ?? ""} placeholder="Support phone" className="rounded border px-3 py-2" />
      </div>

      {initialMedia.length > 0 ? (
        <div className="rounded border border-slate-200 p-3">
          <p className="text-sm font-medium">Existing media</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {initialMedia.map((item) => {
              const removed = removedMediaIds.includes(item.id);
              return (
                <label key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span className="truncate">{item.type}: {item.file_url}</span>
                  <input type="checkbox" checked={removed} onChange={() => setRemovedMediaIds((prev) => (removed ? prev.filter((id) => id !== item.id) : [...prev, item.id]))} />
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Select items to remove them on save.</p>
        </div>
      ) : null}

      <div className="rounded border border-slate-200 p-3">
        <p className="text-sm font-medium">Upload new media</p>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="mt-2 rounded border px-3 py-2"
          onChange={(event) => setNewMedia(Array.from(event.target.files ?? []))}
        />
        {newMedia.length > 0 ? <p className="mt-1 text-xs text-slate-600">{newMedia.length} files selected.</p> : null}
      </div>

      <button type="submit" disabled={state === "submitting"} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60">
        {state === "submitting" ? "Saving..." : submitLabel}
      </button>

      {state === "success" && message ? <FormFeedback tone="success">{message}</FormFeedback> : null}
      {state === "error" && error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
