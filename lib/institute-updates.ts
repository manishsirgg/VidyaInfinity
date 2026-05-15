export const INSTITUTE_UPDATE_IMAGE_BUCKET = "institute-update-images";
export const INSTITUTE_UPDATE_VIDEO_BUCKET = "institute-update-videos";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

export const EDITABLE_STATUSES = new Set(["draft", "pending_review", "rejected"]);

export function sanitizeContent(value: unknown) {
  const content = String(value ?? "").trim();
  if (!content || content.length < 1 || content.length > 280) {
    throw new Error("Content must be between 1 and 280 characters.");
  }
  return content;
}

export function getFileExtension(fileName: string, fallback: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext && ext.length <= 8 ? ext : fallback;
}
