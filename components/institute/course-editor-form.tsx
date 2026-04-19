"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { InstituteCourseWithMedia } from "@/lib/institute/course-queries";

type Props = {
  course: InstituteCourseWithMedia;
};

type SubmitState = "idle" | "saving" | "error" | "success";

function asText(value: string | null) {
  return value ?? "";
}

function getFileKind(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function CourseEditorForm({ course }: Props) {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: course.title,
    summary: asText(course.summary),
    description: asText(course.description),
    category: asText(course.category),
    subject: asText(course.subject),
    level: asText(course.level),
    language: asText(course.language),
    mode: asText(course.mode),
    duration: asText(course.duration),
    durationValue: course.duration_value ? String(course.duration_value) : "",
    durationUnit: asText(course.duration_unit),
    schedule: asText(course.schedule),
    location: asText(course.location),
    startDate: asText(course.start_date),
    endDate: asText(course.end_date),
    admissionDeadline: asText(course.admission_deadline),
    eligibility: asText(course.eligibility),
    learningOutcomes: asText(course.learning_outcomes),
    targetAudience: asText(course.target_audience),
    certificateStatus: asText(course.certificate_status),
    certificateDetails: asText(course.certificate_details),
    batchSize: course.batch_size ? String(course.batch_size) : "",
    placementSupport: course.placement_support === null ? "" : String(course.placement_support),
    internshipSupport: course.internship_support === null ? "" : String(course.internship_support),
    facultyName: asText(course.faculty_name),
    facultyQualification: asText(course.faculty_qualification),
    supportEmail: asText(course.support_email),
    supportPhone: asText(course.support_phone),
    fees: String(course.fees ?? ""),
  });

  const descriptionWords = useMemo(() => {
    if (!form.description.trim()) return 0;
    return form.description.trim().split(/\s+/).length;
  }, [form.description]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(`/api/institute/courses/${course.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!response.ok) {
      setState("error");
      setError(body?.error ?? "Failed to update and resubmit this course.");
      return;
    }

    setState("success");
    setMessage(body?.message ?? "Course updated and submitted for re-approval.");
    router.refresh();
  }

  async function handleDeleteMedia(mediaId: string) {
    setBusyMediaId(mediaId);
    setError("");
    const response = await fetch(`/api/institute/courses/${course.id}/media/${mediaId}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyMediaId(null);

    if (!response.ok) {
      setError(body?.error ?? "Failed to remove media.");
      return;
    }

    router.refresh();
  }

  async function handleUploadMedia() {
    if (files.length === 0) return;
    setState("saving");
    setError("");
    setMessage("");

    const supabase = createClient();

    for (const file of files) {
      const kind = getFileKind(file);
      if (!kind) {
        setState("error");
        setError(`Unsupported media file: ${file.name}`);
        return;
      }

      const fileType = file.type || (kind === "image" ? "image/jpeg" : "video/mp4");
      const signedResponse = await fetch(`/api/institute/courses/${course.id}/media/signed-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType, fileSize: file.size }),
      });
      const signedBody = (await signedResponse.json().catch(() => null)) as { token?: string; path?: string; publicUrl?: string; error?: string } | null;
      if (!signedResponse.ok || !signedBody?.token || !signedBody.path) {
        setState("error");
        setError(signedBody?.error ?? `Unable to prepare upload for ${file.name}`);
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from("course-media")
        .uploadToSignedUrl(signedBody.path, signedBody.token, file, { contentType: fileType });

      if (uploadError) {
        setState("error");
        setError(`Upload failed for ${file.name}: ${uploadError.message}`);
        return;
      }

      const registerResponse = await fetch(`/api/institute/courses/${course.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signedBody.path, publicUrl: signedBody.publicUrl, fileType }),
      });

      if (!registerResponse.ok) {
        const registerBody = (await registerResponse.json().catch(() => null)) as { error?: string } | null;
        setState("error");
        setError(registerBody?.error ?? `Failed to attach media ${file.name}`);
        return;
      }
    }

    setState("success");
    setMessage("Media uploaded successfully.");
    setFiles([]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-4 rounded border bg-white p-5">
        <div>
          <h1 className="text-xl font-semibold">Edit & Resubmit Course</h1>
          <p className="mt-1 text-sm text-slate-600">Update all course details, then submit for admin re-approval.</p>
          {course.rejection_reason ? <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Last rejection reason: {course.rejection_reason}</p> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Title<input required className="mt-1 w-full rounded border px-3 py-2" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></label>
          <label className="text-sm">Summary<input className="mt-1 w-full rounded border px-3 py-2" value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} /></label>
          <label className="text-sm md:col-span-2">Description<textarea className="mt-1 min-h-28 w-full rounded border px-3 py-2" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
          <p className="text-xs text-slate-500 md:col-span-2">Description words: {descriptionWords}/3000</p>
          <label className="text-sm">Category<input className="mt-1 w-full rounded border px-3 py-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></label>
          <label className="text-sm">Subcategory<input className="mt-1 w-full rounded border px-3 py-2" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} /></label>
          <label className="text-sm">Level<input className="mt-1 w-full rounded border px-3 py-2" value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))} /></label>
          <label className="text-sm">Language<input className="mt-1 w-full rounded border px-3 py-2" value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))} /></label>
          <label className="text-sm">Mode<input required className="mt-1 w-full rounded border px-3 py-2" value={form.mode} onChange={(e) => setForm((p) => ({ ...p, mode: e.target.value }))} /></label>
          <label className="text-sm">Duration<input required className="mt-1 w-full rounded border px-3 py-2" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} /></label>
          <label className="text-sm">Duration value<input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={form.durationValue} onChange={(e) => setForm((p) => ({ ...p, durationValue: e.target.value }))} /></label>
          <label className="text-sm">Duration unit<input className="mt-1 w-full rounded border px-3 py-2" value={form.durationUnit} onChange={(e) => setForm((p) => ({ ...p, durationUnit: e.target.value }))} /></label>
          <label className="text-sm">Schedule<input className="mt-1 w-full rounded border px-3 py-2" value={form.schedule} onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))} /></label>
          <label className="text-sm">Location<input className="mt-1 w-full rounded border px-3 py-2" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></label>
          <label className="text-sm">Admission deadline<input type="date" className="mt-1 w-full rounded border px-3 py-2" value={form.admissionDeadline} onChange={(e) => setForm((p) => ({ ...p, admissionDeadline: e.target.value }))} /></label>
          <label className="text-sm">Start date<input type="date" className="mt-1 w-full rounded border px-3 py-2" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} /></label>
          <label className="text-sm">End date<input type="date" className="mt-1 w-full rounded border px-3 py-2" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} /></label>
          <label className="text-sm">Eligibility<textarea className="mt-1 min-h-20 w-full rounded border px-3 py-2" value={form.eligibility} onChange={(e) => setForm((p) => ({ ...p, eligibility: e.target.value }))} /></label>
          <label className="text-sm">Learning outcomes<textarea className="mt-1 min-h-20 w-full rounded border px-3 py-2" value={form.learningOutcomes} onChange={(e) => setForm((p) => ({ ...p, learningOutcomes: e.target.value }))} /></label>
          <label className="text-sm md:col-span-2">Target audience<textarea className="mt-1 min-h-20 w-full rounded border px-3 py-2" value={form.targetAudience} onChange={(e) => setForm((p) => ({ ...p, targetAudience: e.target.value }))} /></label>
          <label className="text-sm">Fee (₹)<input required type="number" min={0} className="mt-1 w-full rounded border px-3 py-2" value={form.fees} onChange={(e) => setForm((p) => ({ ...p, fees: e.target.value }))} /></label>
          <label className="text-sm">Certificate status<input className="mt-1 w-full rounded border px-3 py-2" value={form.certificateStatus} onChange={(e) => setForm((p) => ({ ...p, certificateStatus: e.target.value }))} /></label>
          <label className="text-sm">Certificate details<input className="mt-1 w-full rounded border px-3 py-2" value={form.certificateDetails} onChange={(e) => setForm((p) => ({ ...p, certificateDetails: e.target.value }))} /></label>
          <label className="text-sm">Batch size<input type="number" min={0} className="mt-1 w-full rounded border px-3 py-2" value={form.batchSize} onChange={(e) => setForm((p) => ({ ...p, batchSize: e.target.value }))} /></label>
          <label className="text-sm">Placement support<select className="mt-1 w-full rounded border px-3 py-2" value={form.placementSupport} onChange={(e) => setForm((p) => ({ ...p, placementSupport: e.target.value }))}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>
          <label className="text-sm">Internship support<select className="mt-1 w-full rounded border px-3 py-2" value={form.internshipSupport} onChange={(e) => setForm((p) => ({ ...p, internshipSupport: e.target.value }))}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>
          <label className="text-sm">Faculty name<input className="mt-1 w-full rounded border px-3 py-2" value={form.facultyName} onChange={(e) => setForm((p) => ({ ...p, facultyName: e.target.value }))} /></label>
          <label className="text-sm">Faculty qualification<input className="mt-1 w-full rounded border px-3 py-2" value={form.facultyQualification} onChange={(e) => setForm((p) => ({ ...p, facultyQualification: e.target.value }))} /></label>
          <label className="text-sm">Support email<input type="email" className="mt-1 w-full rounded border px-3 py-2" value={form.supportEmail} onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))} /></label>
          <label className="text-sm">Support phone<input className="mt-1 w-full rounded border px-3 py-2" value={form.supportPhone} onChange={(e) => setForm((p) => ({ ...p, supportPhone: e.target.value }))} /></label>
        </div>

        <button disabled={state === "saving"} className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-60">
          {state === "saving" ? "Saving..." : "Save all details & Resubmit"}
        </button>
      </form>

      <section className="space-y-4 rounded border bg-white p-5">
        <h2 className="text-lg font-semibold">Course media</h2>
        <p className="text-sm text-slate-600">Manage existing media and upload new images/videos for reapproval.</p>

        <div className="grid gap-3 md:grid-cols-2">
          {course.course_media.map((media) => (
            <div key={media.id} className="rounded border p-3 text-sm">
              {media.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.file_url} alt={course.title} className="h-36 w-full rounded object-cover" />
              ) : (
                <video src={media.file_url} controls className="h-36 w-full rounded border" />
              )}
              <p className="mt-2 text-xs text-slate-500">Type: {media.type}</p>
              <button
                type="button"
                disabled={busyMediaId === media.id}
                onClick={() => handleDeleteMedia(media.id)}
                className="mt-2 rounded border border-rose-300 px-3 py-1.5 text-rose-700 disabled:opacity-60"
              >
                {busyMediaId === media.id ? "Removing..." : "Remove media"}
              </button>
            </div>
          ))}
        </div>

        {course.course_media.length === 0 ? <p className="text-sm text-slate-500">No media uploaded yet.</p> : null}

        <div className="rounded border border-dashed p-3">
          <label className="text-sm font-medium">Add new media files</label>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
            className="mt-2 block w-full rounded border px-3 py-2"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 ? <p className="mt-2 text-xs text-slate-500">{files.length} file(s) selected.</p> : null}
          <button type="button" onClick={handleUploadMedia} disabled={state === "saving" || files.length === 0} className="mt-3 rounded border px-3 py-2 text-sm disabled:opacity-60">
            Upload selected media
          </button>
        </div>
      </section>

      {state === "error" && error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {state === "success" && message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
