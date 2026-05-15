import { ModerationActions } from "@/components/admin/moderation-actions";
import { ModerationPagination } from "@/components/admin/moderation-pagination";
import { SyllabusRequestFileActions } from "@/components/admin/syllabus-request-file-actions";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type CourseMediaItem = {
  id: string;
  type: string | null;
  file_url: string;
};

function humanize(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function renderMediaPreview(media: CourseMediaItem) {
  const type = String(media.type ?? "").toLowerCase();
  const isImage = type.includes("image");
  const isVideo = type.includes("video");
  const isAudio = type.includes("audio");

  return (
    <div key={media.id} className="rounded border bg-slate-50 p-2">
      <p className="mb-2 text-xs text-slate-600">{media.type ?? "media"}</p>
      {isImage ? <img src={media.file_url} alt="Course media" className="h-40 w-full rounded object-cover" /> : null}
      {isVideo ? <video src={media.file_url} controls className="h-40 w-full rounded bg-black" /> : null}
      {isAudio ? <audio src={media.file_url} controls className="w-full" /> : null}
      {!isImage && !isVideo && !isAudio ? (
        <a href={media.file_url} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
          Open media file
        </a>
      ) : null}
      <p className="mt-2 break-all text-[11px] text-slate-500">{media.file_url}</p>
    </div>
  );
}

const PAGE_SIZE = 10;
const SYLLABUS_PREVIEW_LIMIT = 280;

type SyllabusRequest = {
  id: string;
  course_id: string;
  status: "pending_review" | "approved" | "rejected" | "deleted";
  proposed_syllabus_text: string | null;
  proposed_file_path: string | null;
  proposed_file_name: string | null;
  proposed_file_size_bytes: number | null;
  proposed_file_mime_type: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
};

async function moderateSyllabus(formData: FormData) {
  "use server";
  await requireUser("admin");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  if (action === "reject" && !rejectionReason) {
    throw new Error("Rejection reason is required to reject a syllabus request.");
  }
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/admin/course-syllabus-requests/${id}/moderate`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, rejectionReason }),
  });
  revalidatePath("/admin/courses");
  revalidatePath("/admin/course-syllabus-updates");
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser("admin");
  const { page } = await searchParams;
  const currentPage = parsePage(page);
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }
  const supabase = admin.data;

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id,title,summary,description,category,subject,level,mode,language,fees,duration,duration_value,duration_unit,schedule,location,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,syllabus_text,syllabus_file_name,syllabus_file_path,syllabus_approved_at,status,rejection_reason,course_media(id,type,file_url),created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load courses for moderation", { error: error.message });
  }
  const courseIds = (courses ?? []).map((course) => course.id);
  const latestSyllabusRequestByCourseId = new Map<string, SyllabusRequest>();
  if (courseIds.length > 0) {
    const { data: syllabusRequests } = await supabase
      .from("course_syllabus_update_requests")
      .select("id,course_id,status,proposed_syllabus_text,proposed_file_path,proposed_file_name,proposed_file_size_bytes,proposed_file_mime_type,rejection_reason,created_at,approved_at,rejected_at")
      .in("course_id", courseIds)
      .is("deleted_at", null)
      .in("status", ["pending_review", "rejected", "approved"])
      .order("created_at", { ascending: false });
    for (const request of (syllabusRequests ?? []) as SyllabusRequest[]) {
      if (!latestSyllabusRequestByCourseId.has(request.course_id)) latestSyllabusRequestByCourseId.set(request.course_id, request);
    }
  }

  const pendingCourses = (courses ?? []).filter((course) => course.status === "pending");
  const reviewedCourses = (courses ?? []).filter((course) => course.status !== "pending");
  const sortedCourses = [...pendingCourses, ...reviewedCourses];
  const totalCourses = sortedCourses.length;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedCourses = sortedCourses.slice(startIndex, startIndex + PAGE_SIZE);
  const paginatedPendingCourses = paginatedCourses.filter((course) => course.status === "pending");
  const paginatedReviewedCourses = paginatedCourses.filter((course) => course.status !== "pending");

  return (
    <div className="vi-page">
      <h1 className="vi-page-title">Admin Courses Moderation</h1>
      <p className="vi-page-subtitle">Review every submitted field and all uploaded media before approving or rejecting.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="vi-card p-3 text-sm">Pending courses: {pendingCourses.length}</div>
        <div className="vi-card p-3 text-sm">Reviewed courses: {reviewedCourses.length}</div>
        <div className="vi-card p-3 text-sm">Total courses: {totalCourses}</div>
      </div>
      {error ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load courses right now. Please refresh or check Supabase policies/logs.
        </p>
      ) : null}
      <h2 className="mt-6 text-lg font-semibold">Pending queue</h2>
      <div className="mt-4 space-y-5">
        {paginatedPendingCourses.map((course) => (
          <div key={course.id} className="vi-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold">{course.title} · {course.status}</p>
              <p className="text-xs text-slate-500">Created: {formatDate(course.created_at)} · Updated: {formatDate(course.updated_at)}</p>
            </div>

            <div className="mt-3 grid gap-2 text-slate-700 sm:grid-cols-2">
              <p><span className="font-medium">Category:</span> {humanize(course.category)}</p>
              <p><span className="font-medium">Subject:</span> {humanize(course.subject)}</p>
              <p><span className="font-medium">Level:</span> {humanize(course.level)}</p>
              <p><span className="font-medium">Mode:</span> {humanize(course.mode)}</p>
              <p><span className="font-medium">Language:</span> {humanize(course.language)}</p>
              <p><span className="font-medium">Duration:</span> {humanize(course.duration)}</p>
              <p><span className="font-medium">Duration value:</span> {course.duration_value ?? "-"}</p>
              <p><span className="font-medium">Duration unit:</span> {humanize(course.duration_unit)}</p>
              <p><span className="font-medium">Schedule:</span> {humanize(course.schedule)}</p>
              <p><span className="font-medium">Location:</span> {humanize(course.location)}</p>
              <p><span className="font-medium">Start date:</span> {formatDate(course.start_date)}</p>
              <p><span className="font-medium">End date:</span> {formatDate(course.end_date)}</p>
              <p><span className="font-medium">Admission deadline:</span> {formatDate(course.admission_deadline)}</p>
              <p><span className="font-medium">Fees:</span> ₹{course.fees}</p>
              <p><span className="font-medium">Batch size:</span> {course.batch_size ?? "-"}</p>
              <p><span className="font-medium">Faculty:</span> {humanize(course.faculty_name)}</p>
              <p><span className="font-medium">Faculty qualification:</span> {humanize(course.faculty_qualification)}</p>
              <p><span className="font-medium">Support email:</span> {humanize(course.support_email)}</p>
              <p><span className="font-medium">Support phone:</span> {humanize(course.support_phone)}</p>
              <p><span className="font-medium">Placement support:</span> {course.placement_support === null ? "-" : course.placement_support ? "Yes" : "No"}</p>
              <p><span className="font-medium">Internship support:</span> {course.internship_support === null ? "-" : course.internship_support ? "Yes" : "No"}</p>
              <p><span className="font-medium">Certificate status:</span> {humanize(course.certificate_status)}</p>
            </div>

            <div className="mt-3 space-y-2 text-slate-700">
              <p><span className="font-medium">Summary:</span> {humanize(course.summary)}</p>
              <p><span className="font-medium">Description:</span> {humanize(course.description)}</p>
              <p><span className="font-medium">Eligibility:</span> {humanize(course.eligibility)}</p>
              <p><span className="font-medium">Learning outcomes:</span> {humanize(course.learning_outcomes)}</p>
              <p><span className="font-medium">Target audience:</span> {humanize(course.target_audience)}</p>
              <p><span className="font-medium">Certificate details:</span> {humanize(course.certificate_details)}</p>
              {(() => {
                const request = latestSyllabusRequestByCourseId.get(course.id);
                const hasApproved = Boolean(course.syllabus_text || course.syllabus_file_name || course.syllabus_file_path);
                const previewText = (value: string) => value.length > SYLLABUS_PREVIEW_LIMIT ? `${value.slice(0, SYLLABUS_PREVIEW_LIMIT)}…` : value;
                return (
                  <div className="rounded border border-slate-200 p-3">
                    <p className="font-semibold text-slate-800">Course Syllabus</p>
                    {!hasApproved && !request ? <p className="mt-1 text-xs text-slate-600">No syllabus submitted.</p> : null}
                    {hasApproved ? <div className="mt-2 space-y-1 text-xs">
                      <p className="font-medium text-slate-700">Approved syllabus</p>
                      {course.syllabus_text ? <details><summary className="cursor-pointer">Text preview</summary><p className="mt-1 whitespace-pre-wrap">{previewText(course.syllabus_text)}</p></details> : <p>Text: -</p>}
                      <p>PDF: {humanize(course.syllabus_file_name ?? course.syllabus_file_path)}</p>
                      <p>Approved at: {formatDate(course.syllabus_approved_at)}</p>
                    </div> : null}
                    {request ? <div className="mt-3 space-y-1 text-xs">
                      <p className="font-medium text-slate-700">Latest submitted request</p>
                      <p>Status: <span className="rounded bg-slate-100 px-2 py-0.5">{request.status}</span></p>
                      <p>Submitted: {formatDate(request.created_at)}</p>
                      {request.proposed_syllabus_text ? <details><summary className="cursor-pointer">Proposed text preview</summary><p className="mt-1 whitespace-pre-wrap">{previewText(request.proposed_syllabus_text)}</p></details> : <p>Proposed text: -</p>}
                      <p>Proposed PDF: {humanize(request.proposed_file_name ?? request.proposed_file_path)}</p>
                      {request.status === "rejected" && request.rejection_reason ? <p className="text-rose-600">Rejection reason: {request.rejection_reason}</p> : null}
                      {request.status === "pending_review" ? <div className="mt-2 space-y-2">
                        {request.proposed_file_path ? <SyllabusRequestFileActions requestId={request.id} /> : null}
                        <form action={moderateSyllabus} className="flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={request.id} />
                          <button name="action" value="approve" className="rounded bg-emerald-600 px-2 py-1 text-white">Approve Syllabus</button>
                          <input name="rejectionReason" required placeholder="Rejection reason" className="rounded border px-2 py-1" />
                          <button name="action" value="reject" className="rounded bg-amber-600 px-2 py-1 text-white">Reject Syllabus</button>
                        </form>
                      </div> : null}
                    </div> : null}
                  </div>
                );
              })()}
            </div>

            <div className="mt-4">
              <p className="font-medium text-slate-700">Media ({course.course_media?.length ?? 0})</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(course.course_media ?? []).map((media) => renderMediaPreview(media))}
              </div>
            </div>

            {course.rejection_reason && <p className="mt-3 text-xs text-rose-600">Reason: {course.rejection_reason}</p>}
            <ModerationActions targetType="courses" targetId={course.id} currentStatus={course.status} />
          </div>
        ))}
      </div>
      {paginatedPendingCourses.length === 0 ? <p className="mt-4 vi-empty p-4 text-sm text-slate-600">No pending courses on this page.</p> : null}

      {paginatedReviewedCourses.length > 0 ? <h2 className="mt-8 text-lg font-semibold">Reviewed courses</h2> : null}
      <div className="mt-4 space-y-5">
        {paginatedReviewedCourses.map((course) => (
          <div key={course.id} className="vi-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold">{course.title} · {course.status}</p>
              <p className="text-xs text-slate-500">Created: {formatDate(course.created_at)} · Updated: {formatDate(course.updated_at)}</p>
            </div>

            <div className="mt-3 grid gap-2 text-slate-700 sm:grid-cols-2">
              <p><span className="font-medium">Category:</span> {humanize(course.category)}</p>
              <p><span className="font-medium">Subject:</span> {humanize(course.subject)}</p>
              <p><span className="font-medium">Level:</span> {humanize(course.level)}</p>
              <p><span className="font-medium">Mode:</span> {humanize(course.mode)}</p>
              <p><span className="font-medium">Language:</span> {humanize(course.language)}</p>
              <p><span className="font-medium">Duration:</span> {humanize(course.duration)}</p>
              <p><span className="font-medium">Duration value:</span> {course.duration_value ?? "-"}</p>
              <p><span className="font-medium">Duration unit:</span> {humanize(course.duration_unit)}</p>
              <p><span className="font-medium">Schedule:</span> {humanize(course.schedule)}</p>
              <p><span className="font-medium">Location:</span> {humanize(course.location)}</p>
              <p><span className="font-medium">Start date:</span> {formatDate(course.start_date)}</p>
              <p><span className="font-medium">End date:</span> {formatDate(course.end_date)}</p>
              <p><span className="font-medium">Admission deadline:</span> {formatDate(course.admission_deadline)}</p>
              <p><span className="font-medium">Fees:</span> ₹{course.fees}</p>
              <p><span className="font-medium">Batch size:</span> {course.batch_size ?? "-"}</p>
              <p><span className="font-medium">Faculty:</span> {humanize(course.faculty_name)}</p>
              <p><span className="font-medium">Faculty qualification:</span> {humanize(course.faculty_qualification)}</p>
              <p><span className="font-medium">Support email:</span> {humanize(course.support_email)}</p>
              <p><span className="font-medium">Support phone:</span> {humanize(course.support_phone)}</p>
              <p><span className="font-medium">Placement support:</span> {course.placement_support === null ? "-" : course.placement_support ? "Yes" : "No"}</p>
              <p><span className="font-medium">Internship support:</span> {course.internship_support === null ? "-" : course.internship_support ? "Yes" : "No"}</p>
              <p><span className="font-medium">Certificate status:</span> {humanize(course.certificate_status)}</p>
            </div>

            <div className="mt-3 space-y-2 text-slate-700">
              <p><span className="font-medium">Summary:</span> {humanize(course.summary)}</p>
              <p><span className="font-medium">Description:</span> {humanize(course.description)}</p>
              <p><span className="font-medium">Eligibility:</span> {humanize(course.eligibility)}</p>
              <p><span className="font-medium">Learning outcomes:</span> {humanize(course.learning_outcomes)}</p>
              <p><span className="font-medium">Target audience:</span> {humanize(course.target_audience)}</p>
              <p><span className="font-medium">Certificate details:</span> {humanize(course.certificate_details)}</p>
              {(() => {
                const request = latestSyllabusRequestByCourseId.get(course.id);
                const hasApproved = Boolean(course.syllabus_text || course.syllabus_file_name || course.syllabus_file_path);
                const previewText = (value: string) => value.length > SYLLABUS_PREVIEW_LIMIT ? `${value.slice(0, SYLLABUS_PREVIEW_LIMIT)}…` : value;
                return (
                  <div className="rounded border border-slate-200 p-3">
                    <p className="font-semibold text-slate-800">Course Syllabus</p>
                    {!hasApproved && !request ? <p className="mt-1 text-xs text-slate-600">No syllabus submitted.</p> : null}
                    {hasApproved ? <div className="mt-2 space-y-1 text-xs">
                      <p className="font-medium text-slate-700">Approved syllabus</p>
                      {course.syllabus_text ? <details><summary className="cursor-pointer">Text preview</summary><p className="mt-1 whitespace-pre-wrap">{previewText(course.syllabus_text)}</p></details> : <p>Text: -</p>}
                      <p>PDF: {humanize(course.syllabus_file_name ?? course.syllabus_file_path)}</p>
                      <p>Approved at: {formatDate(course.syllabus_approved_at)}</p>
                    </div> : null}
                    {request ? <div className="mt-3 space-y-1 text-xs">
                      <p className="font-medium text-slate-700">Latest submitted request</p>
                      <p>Status: <span className="rounded bg-slate-100 px-2 py-0.5">{request.status}</span></p>
                      <p>Submitted: {formatDate(request.created_at)}</p>
                      {request.proposed_syllabus_text ? <details><summary className="cursor-pointer">Proposed text preview</summary><p className="mt-1 whitespace-pre-wrap">{previewText(request.proposed_syllabus_text)}</p></details> : <p>Proposed text: -</p>}
                      <p>Proposed PDF: {humanize(request.proposed_file_name ?? request.proposed_file_path)}</p>
                      {request.status === "rejected" && request.rejection_reason ? <p className="text-rose-600">Rejection reason: {request.rejection_reason}</p> : null}
                      {request.status === "pending_review" ? <div className="mt-2 space-y-2">
                        {request.proposed_file_path ? <SyllabusRequestFileActions requestId={request.id} /> : null}
                        <form action={moderateSyllabus} className="flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={request.id} />
                          <button name="action" value="approve" className="rounded bg-emerald-600 px-2 py-1 text-white">Approve Syllabus</button>
                          <input name="rejectionReason" required placeholder="Rejection reason" className="rounded border px-2 py-1" />
                          <button name="action" value="reject" className="rounded bg-amber-600 px-2 py-1 text-white">Reject Syllabus</button>
                        </form>
                      </div> : null}
                    </div> : null}
                  </div>
                );
              })()}
            </div>

            <div className="mt-4">
              <p className="font-medium text-slate-700">Media ({course.course_media?.length ?? 0})</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(course.course_media ?? []).map((media) => renderMediaPreview(media))}
              </div>
            </div>

            {course.rejection_reason && <p className="mt-3 text-xs text-rose-600">Reason: {course.rejection_reason}</p>}
            <ModerationActions targetType="courses" targetId={course.id} currentStatus={course.status} />
          </div>
        ))}
        {!error && totalCourses === 0 ? <p className="vi-empty p-4 text-sm text-slate-600">No courses found for moderation.</p> : null}
      </div>
      <ModerationPagination page={currentPage} pageSize={PAGE_SIZE} totalItems={totalCourses} pathname="/admin/courses" query={{}} />
    </div>
  );
}
