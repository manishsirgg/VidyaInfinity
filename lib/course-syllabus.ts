export const COURSE_SYLLABUS_BUCKET = "course-syllabi";
export const COURSE_SYLLABUS_MAX_TEXT_LENGTH = 30000;
export const COURSE_SYLLABUS_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const COURSE_SYLLABUS_ALLOWED_MIME = "application/pdf";

export const COURSE_SYLLABUS_REQUEST_STATUSES = ["draft", "pending_review", "approved", "rejected", "deleted"] as const;

export type CourseSyllabusRequestStatus = (typeof COURSE_SYLLABUS_REQUEST_STATUSES)[number];

export function sanitizeSyllabusText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function validateSyllabusText(text: string | null) {
  if (!text) return null;
  if (text.length > COURSE_SYLLABUS_MAX_TEXT_LENGTH) return `Syllabus text must be ${COURSE_SYLLABUS_MAX_TEXT_LENGTH} characters or fewer.`;
  return null;
}

export function validateSyllabusPdf(meta: { mimeType: string | null; size: number | null }) {
  if (!meta.mimeType || !meta.size) return null;
  if (meta.mimeType !== COURSE_SYLLABUS_ALLOWED_MIME) return "Only PDF files are allowed.";
  if (meta.size > COURSE_SYLLABUS_MAX_FILE_SIZE_BYTES) return "Syllabus PDF must be 10 MB or smaller.";
  return null;
}

export function buildSyllabusStoragePath(instituteId: string, courseId: string, requestId: string) {
  return `${instituteId}/${courseId}/${requestId}/syllabus.pdf`;
}
