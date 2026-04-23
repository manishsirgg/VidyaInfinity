"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function resolveMediaUrl(fileUrl: string | null | undefined, storagePath?: string | null) {
  const direct = String(fileUrl ?? "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;

  const path = String(storagePath ?? direct).trim().replace(/^\/+/, "");
  if (!path) return "";

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}/storage/v1/object/public/course-media/${path}`;
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

function Field({
  label,
  helper,
  required,
  children,
  className = "",
}: {
  label: string;
  helper?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
      {helper ? <span className="block text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

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
  const [replacementMedia, setReplacementMedia] = useState<Record<string, File>>({});
  const [savedMedia, setSavedMedia] = useState<InstituteCourseMedia[]>(
    initialMedia.map((item) => ({ ...item, file_url: resolveMediaUrl(item.file_url, item.storage_path) })),
  );
  const [isLoadingSavedMedia, setIsLoadingSavedMedia] = useState(false);
  const [step, setStep] = useState(0);
  const steps = ["Basics", "Duration", "Outcomes", "Support", "Media & review"];

  const computedDuration = useMemo(() => {
    if (durationValue && durationUnit) return `${durationValue} ${durationUnit}`;
    return initialCourse?.duration ?? "";
  }, [durationUnit, durationValue, initialCourse?.duration]);

  const descriptionWords = useMemo(() => getWordCount(description), [description]);
  const currentMedia = useMemo(() => savedMedia.filter((item) => !removedMediaIds.includes(item.id)), [savedMedia, removedMediaIds]);
  const removedMediaSet = useMemo(() => new Set(removedMediaIds), [removedMediaIds]);
  const newMediaPreviews = useMemo(
    () =>
      newMedia.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        kind: getFileKind(file),
        url: URL.createObjectURL(file),
      })),
    [newMedia],
  );

  useEffect(() => {
    return () => {
      newMediaPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [newMediaPreviews]);

  useEffect(() => {
    setSavedMedia(initialMedia.map((item) => ({ ...item, file_url: resolveMediaUrl(item.file_url, item.storage_path) })));
  }, [initialMedia]);

  useEffect(() => {
    if (mode === "create" || !initialCourse?.id || initialMedia.length > 0) return;

    let active = true;
    setIsLoadingSavedMedia(true);

    fetch(`/api/institute/courses/${initialCourse.id}`, { method: "GET" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as
          | {
              media?: Array<{
                id?: string;
                file_url?: string | null;
                storage_path?: string | null;
                type?: string | null;
                media_type?: string | null;
              }>;
            }
          | null;
      })
      .then((body) => {
        if (!active || !body?.media) return;
        const normalized = body.media
          .map((item) => {
            const id = String(item.id ?? "").trim();
            const typeRaw = String(item.type ?? item.media_type ?? "").trim().toLowerCase();
            const type = typeRaw === "video" ? "video" : typeRaw === "image" ? "image" : "";
            const fileUrl = resolveMediaUrl(item.file_url, item.storage_path);
            if (!id || !type || !fileUrl) return null;
            return { id, type, file_url: fileUrl, storage_path: item.storage_path ?? null } as InstituteCourseMedia;
          })
          .filter((item): item is InstituteCourseMedia => item !== null);
        if (normalized.length > 0) {
          setSavedMedia(normalized);
        }
      })
      .finally(() => {
        if (active) setIsLoadingSavedMedia(false);
      });

    return () => {
      active = false;
    };
  }, [initialCourse?.id, initialMedia.length, mode]);

  async function uploadFiles(courseId: string, files: File[]) {
    const failures: string[] = [];

    for (const file of files) {
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

  async function uploadNewMedia(courseId: string) {
    return uploadFiles(courseId, newMedia);
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

  async function replaceMarkedMedia(courseId: string) {
    const replacements = Object.entries(replacementMedia);
    const failures: string[] = [];

    for (const [mediaId, file] of replacements) {
      const replaceValidationError = mediaError([file]);
      if (replaceValidationError) {
        failures.push(`Replacement failed for ${file.name}: ${replaceValidationError}`);
        continue;
      }

      const removeResponse = await fetch(`/api/institute/courses/${courseId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      if (!removeResponse.ok) {
        const removeBody = (await removeResponse.json().catch(() => null)) as { error?: string } | null;
        failures.push(removeBody?.error ?? `Failed to remove media for replacement (${file.name}).`);
        continue;
      }

      const uploadFailures = await uploadFiles(courseId, [file]);
      failures.push(...uploadFailures.map((item) => `Replacement failed for ${file.name}: ${item}`));
    }

    return failures;
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
    const replacementFailures = await replaceMarkedMedia(courseId);
    const mediaFailures = [...replacementFailures, ...(await uploadNewMedia(courseId))];

    setState(mediaFailures.length ? "error" : "success");
    setMessage(successMessage);

    if (mediaFailures.length) {
      setError(mediaFailures[0] ?? "Some media actions failed.");
    }

    if (mode === "create") {
      router.push(`/institute/courses/${courseId}?submitted=1`);
      router.refresh();
      return;
    }

    router.push(`/institute/courses/${courseId}`);
    router.refresh();
  }

  const pageTitle = mode === "create" ? "Add a new course" : mode === "resubmit" ? "Resubmit rejected course" : "Edit course";
  const totalMediaAfterSave = currentMedia.length + newMedia.length;

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4">
        <h2 className="text-xl font-semibold text-slate-900">{pageTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">All edits are sent for moderation approval.</p>
        <p className="mt-2 text-xs text-slate-500">
          Fields marked with <span className="text-rose-600">*</span> are required.
        </p>
      </div>

      <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Step {step + 1} of {steps.length}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {steps.map((item, index) => (
            <button key={item} type="button" onClick={() => setStep(index)} className={`rounded-full border px-3 py-1 text-xs ${step === index ? "border-brand-300 bg-white text-brand-800" : "border-brand-100 text-slate-600"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className={`space-y-3 rounded-lg border border-slate-200 p-4 ${step === 0 ? "block" : "hidden"}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Course basics</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Course title" required>
            <input name="title" required defaultValue={initialCourse?.title ?? ""} placeholder="e.g. Full Stack Web Development" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Short summary">
            <input name="summary" defaultValue={initialCourse?.summary ?? ""} placeholder="A quick one-line course pitch" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Description" className="md:col-span-2" helper={`Word count: ${descriptionWords}/3000`}>
            <textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what this course covers, learning flow, and outcomes." className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Category">
            <input name="category" defaultValue={initialCourse?.category ?? ""} placeholder="e.g. Technology" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Subject">
            <input name="subject" defaultValue={initialCourse?.subject ?? ""} placeholder="e.g. Data Science" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Level">
            <select name="level" defaultValue={initialCourse?.level ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select level</option>{LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </Field>
          <Field label="Language">
            <input name="language" defaultValue={initialCourse?.language ?? ""} placeholder="e.g. English" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Fees" required helper="Enter total amount in INR.">
            <input name="fees" type="number" min={0} required defaultValue={initialCourse?.fees ?? 0} placeholder="0" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Mode" required>
            <select name="mode" required defaultValue={initialCourse?.mode ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select mode</option>{COURSE_MODE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </Field>
        </div>
      </section>

      <section className={`space-y-3 rounded-lg border border-slate-200 p-4 ${step === 1 ? "block" : "hidden"}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Duration & schedule</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Duration value" required>
            <input name="durationValue" required type="number" min={1} value={durationValue} onChange={(event) => setDurationValue(event.target.value)} placeholder="e.g. 12" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Duration unit" required helper={computedDuration ? `Combined duration: ${computedDuration}` : undefined}>
            <select name="durationUnit" required value={durationUnit} onChange={(event) => setDurationUnit(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select duration unit</option>{DURATION_UNITS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </Field>
          <Field label="Location">
            <input name="location" defaultValue={initialCourse?.location ?? ""} placeholder="Online / City / Campus" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Schedule">
            <input name="schedule" defaultValue={initialCourse?.schedule ?? ""} placeholder="Weekend, evening, weekdays..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Admission deadline">
            <input name="admissionDeadline" type="date" defaultValue={initialCourse?.admission_deadline ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Start date">
            <input name="startDate" type="date" defaultValue={initialCourse?.start_date ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="End date">
            <input name="endDate" type="date" defaultValue={initialCourse?.end_date ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
      </section>

      <section className={`space-y-3 rounded-lg border border-slate-200 p-4 ${step === 2 ? "block" : "hidden"}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Eligibility & learner outcomes</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Eligibility">
            <textarea name="eligibility" defaultValue={initialCourse?.eligibility ?? ""} placeholder="Prerequisites students should meet." className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Learning outcomes">
            <textarea name="learningOutcomes" defaultValue={initialCourse?.learning_outcomes ?? ""} placeholder="What students can do after completing this course." className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Target audience" className="md:col-span-2">
            <textarea name="targetAudience" defaultValue={initialCourse?.target_audience ?? ""} placeholder="Who should enroll in this course?" className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
      </section>

      <section className={`space-y-3 rounded-lg border border-slate-200 p-4 ${step === 3 ? "block" : "hidden"}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Certification, faculty & support</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Certificate status">
            <select name="certificateStatus" defaultValue={initialCourse?.certificate_status ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select certificate status</option>{CERTIFICATE_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </Field>
          <Field label="Certificate details">
            <input name="certificateDetails" defaultValue={initialCourse?.certificate_details ?? ""} placeholder="Issuing body, validity, etc." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Batch size">
            <input name="batchSize" type="number" min={0} defaultValue={initialCourse?.batch_size ?? ""} placeholder="e.g. 40" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Placement support">
            <select name="placementSupport" defaultValue={initialCourse?.placement_support === null ? "" : String(initialCourse?.placement_support)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>
          </Field>
          <Field label="Internship support">
            <select name="internshipSupport" defaultValue={initialCourse?.internship_support === null ? "" : String(initialCourse?.internship_support)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>
          </Field>
          <Field label="Faculty name">
            <input name="facultyName" defaultValue={initialCourse?.faculty_name ?? ""} placeholder="Name of lead faculty" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Faculty qualification">
            <input name="facultyQualification" defaultValue={initialCourse?.faculty_qualification ?? ""} placeholder="e.g. PhD, Industry experience" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Support email">
            <input name="supportEmail" type="email" defaultValue={initialCourse?.support_email ?? ""} placeholder="help@yourinstitute.com" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Support phone">
            <input name="supportPhone" defaultValue={initialCourse?.support_phone ?? ""} placeholder="+91..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
      </section>

      <div className={`rounded border border-slate-200 p-4 ${step === 4 ? "block" : "hidden"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Existing media</p>
            <p className="text-xs text-slate-500">
              {currentMedia.length} active • {removedMediaIds.length} marked for deletion
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedMedia.map((item) => {
              const removed = removedMediaSet.has(item.id);
              const isVideo = item.type === "video";
              const replacement = replacementMedia[item.id];
              return (
                <article key={item.id} className={`overflow-hidden rounded-lg border ${removed ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-white"}`}>
                  <div className="relative bg-slate-100">
                    {isVideo ? (
                      <video className={`h-36 w-full object-cover ${removed ? "opacity-50" : ""}`} src={item.file_url} muted preload="metadata" controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={`h-36 w-full object-cover ${removed ? "opacity-50" : ""}`} src={item.file_url} alt={initialCourse?.title ?? "Course media"} />
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
                      {isVideo ? "Video" : "Image"}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-xs text-slate-600">{item.file_url}</p>
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      View full media
                    </a>
                    {!removed ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-700">
                          Replace media
                          <input
                            type="file"
                            accept={isVideo ? "video/mp4,video/webm,video/quicktime,video/x-m4v" : "image/png,image/jpeg,image/jpg,image/webp"}
                            className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              const nextKind = getFileKind(file);
                              if ((isVideo && nextKind !== "video") || (!isVideo && nextKind !== "image")) {
                                setError(`Replacement for ${isVideo ? "video" : "image"} media must be the same file type.`);
                                event.currentTarget.value = "";
                                return;
                              }
                              setError("");
                              setReplacementMedia((prev) => ({ ...prev, [item.id]: file }));
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {replacement ? (
                          <div className="flex items-center justify-between gap-2 rounded border border-brand-200 bg-brand-50 px-2 py-1.5">
                            <p className="truncate text-[11px] text-brand-800">{replacement.name}</p>
                            <button
                              type="button"
                              onClick={() =>
                                setReplacementMedia((prev) => {
                                  const next = { ...prev };
                                  delete next[item.id];
                                  return next;
                                })
                              }
                              className="rounded bg-white px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-slate-100"
                            >
                              Undo replace
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setRemovedMediaIds((prev) => {
                          if (removed) {
                            return prev.filter((id) => id !== item.id);
                          }
                          setReplacementMedia((current) => {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          });
                          return [...prev, item.id];
                        })
                      }
                      className={`rounded px-3 py-1.5 text-xs font-medium ${removed ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`}
                    >
                      {removed ? "Undo delete" : "Mark for delete"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {savedMedia.length === 0 ? (
            <p className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
              {isLoadingSavedMedia ? "Loading saved media..." : "No saved media found for this course yet. You can add new media below."}
            </p>
          ) : null}
      </div>

      <div className={`rounded border border-slate-200 p-4 ${step === 4 ? "block" : "hidden"}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Upload new media</p>
          <p className="text-xs text-slate-500">Up to {MAX_MEDIA_FILES} files per upload action</p>
        </div>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="mt-2 w-full rounded border px-3 py-2 text-sm"
          onChange={(event) => {
            const incoming = Array.from(event.target.files ?? []);
            if (incoming.length === 0) return;
            setNewMedia((prev) => {
              const seen = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
              const merged = [...prev];
              for (const file of incoming) {
                const key = `${file.name}-${file.size}-${file.lastModified}`;
                if (!seen.has(key)) {
                  merged.push(file);
                  seen.add(key);
                }
              }
              return merged;
            });
            event.currentTarget.value = "";
          }}
        />
        {newMediaPreviews.length > 0 ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">{newMediaPreviews.length} new files queued</p>
              <button
                type="button"
                onClick={() => setNewMedia([])}
                className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Clear all
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {newMediaPreviews.map((item) => (
                <article key={item.key} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="relative bg-slate-100">
                    {item.kind === "video" ? (
                      <video className="h-32 w-full object-cover" src={item.url} muted preload="metadata" controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="h-32 w-full object-cover" src={item.url} alt={item.name} />
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
                      {item.kind === "video" ? "Video" : "Image"}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-xs font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(item.size)}</p>
                    <button
                      type="button"
                      onClick={() => setNewMedia((prev) => prev.filter((file) => `${file.name}-${file.size}-${file.lastModified}` !== item.key))}
                      className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No new files selected yet.</p>
        )}
      </div>

      <div className={`rounded border border-slate-200 bg-slate-50 p-3 ${step === 4 ? "block" : "hidden"}`}>
        <p className="text-sm font-medium text-slate-800">Media summary after save</p>
        <p className="mt-1 text-xs text-slate-600">
          Existing: {currentMedia.length} • New: {newMedia.length} • Total after save: {totalMediaAfterSave}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs text-slate-500">Tip: Keep your summary concise and outcomes measurable for higher conversions.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setStep((prev) => Math.max(0, prev - 1))} disabled={step === 0} className="rounded-md border px-4 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
            Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={() => setStep((prev) => Math.min(steps.length - 1, prev + 1))} className="rounded-md border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
              Next step
            </button>
          ) : null}
        </div>
        <button type="submit" disabled={state === "submitting"} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
          {state === "submitting" ? "Saving..." : submitLabel}
        </button>
      </div>

      {state === "success" && message ? <FormFeedback tone="success">{message}</FormFeedback> : null}
      {state === "error" && error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
