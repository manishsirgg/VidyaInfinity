import { ModerationActions } from "@/components/admin/moderation-actions";
import { ModerationPagination } from "@/components/admin/moderation-pagination";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    .select(
      "id,title,summary,description,category,subject,level,mode,language,fees,duration,duration_value,duration_unit,schedule,location,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,status,rejection_reason,course_media(id,type,file_url),created_at,updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load courses for moderation", { error: error.message });
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
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Courses Moderation</h1>
      <p className="mt-2 text-sm text-slate-600">Review every submitted field and all uploaded media before approving or rejecting.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded border bg-white p-3 text-sm">Pending courses: {pendingCourses.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Reviewed courses: {reviewedCourses.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Total courses: {totalCourses}</div>
      </div>
      {error ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load courses right now. Please refresh or check Supabase policies/logs.
        </p>
      ) : null}
      <h2 className="mt-6 text-lg font-semibold">Pending queue</h2>
      <div className="mt-4 space-y-4">
        {paginatedPendingCourses.map((course) => (
          <div key={course.id} className="rounded border bg-white p-4 text-sm">
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
      {paginatedPendingCourses.length === 0 ? <p className="mt-4 rounded border bg-white p-4 text-sm text-slate-600">No pending courses on this page.</p> : null}

      {paginatedReviewedCourses.length > 0 ? <h2 className="mt-8 text-lg font-semibold">Reviewed courses</h2> : null}
      <div className="mt-4 space-y-4">
        {paginatedReviewedCourses.map((course) => (
          <div key={course.id} className="rounded border bg-white p-4 text-sm">
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
        {!error && totalCourses === 0 ? <p className="rounded border bg-white p-4 text-sm text-slate-600">No courses found for moderation.</p> : null}
      </div>
      <ModerationPagination page={currentPage} pageSize={PAGE_SIZE} totalItems={totalCourses} pathname="/admin/courses" query={{}} />
    </div>
  );
}
