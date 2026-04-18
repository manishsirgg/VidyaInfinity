import path from "node:path";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const STORAGE_BUCKETS = {
  userDocuments: "user-documents",
  instituteDocuments: "institute-documents",
  courseMedia: "course-media",
  blogMedia: "blog-media",
  psychometricReports: "psychometric-reports",
  avatars: "avatars",
} as const;

type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

type UploadResult = {
  error: string | null;
  path?: string;
  publicUrl?: string;
};

const allowedMimeTypes: Record<StorageBucket, string[]> = {
  "user-documents": ["application/pdf", "image/png", "image/jpeg"],
  "institute-documents": ["application/pdf", "image/png", "image/jpeg"],
  "course-media": [
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  "blog-media": ["image/png", "image/jpeg", "image/webp", "video/mp4", "application/pdf"],
  "psychometric-reports": ["application/pdf"],
  avatars: ["image/png", "image/jpeg", "image/webp"],
};

const maxSizeByBucket: Record<StorageBucket, number> = {
  "user-documents": 5 * 1024 * 1024,
  "institute-documents": 5 * 1024 * 1024,
  "course-media": 50 * 1024 * 1024,
  "blog-media": 20 * 1024 * 1024,
  "psychometric-reports": 10 * 1024 * 1024,
  avatars: 3 * 1024 * 1024,
};

function sanitizeFilename(filename: string) {
  const base = path.basename(filename || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extFromMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

async function uploadBytes({
  bucket,
  uploadPath,
  bytes,
  contentType,
  upsert = false,
}: {
  bucket: StorageBucket;
  uploadPath: string;
  bytes: Buffer;
  contentType: string;
  upsert?: boolean;
}): Promise<UploadResult> {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  if (!allowedMimeTypes[bucket].includes(contentType)) {
    return { error: `Unsupported file type ${contentType} for bucket ${bucket}` };
  }

  const maxSize = maxSizeByBucket[bucket];
  if (bytes.length > maxSize) {
    return { error: `File too large. Max allowed ${(maxSize / 1024 / 1024).toFixed(1)}MB` };
  }

  const { error: uploadError } = await admin.data.storage.from(bucket).upload(uploadPath, bytes, {
    contentType,
    upsert,
  });

  if (uploadError) return { error: uploadError.message };

  const publicUrl =
    bucket === STORAGE_BUCKETS.userDocuments ||
    bucket === STORAGE_BUCKETS.instituteDocuments ||
    bucket === STORAGE_BUCKETS.psychometricReports
      ? undefined
      : admin.data.storage.from(bucket).getPublicUrl(uploadPath).data.publicUrl;

  return {
    error: null,
    path: uploadPath,
    publicUrl,
  };
}

export async function uploadUserDocument({
  userId,
  file,
  category,
}: {
  userId: string;
  file: File;
  category: "identity" | "authorization";
}) {
  const filename = sanitizeFilename(file.name);
  const uploadPath = `${userId}/${category}/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  return uploadBytes({
    bucket: STORAGE_BUCKETS.userDocuments,
    uploadPath,
    bytes,
    contentType: file.type,
  });
}

export async function uploadInstituteDocument({
  userId,
  file,
  type,
}: {
  userId: string;
  file: File;
  type: "approval";
}) {
  const filename = sanitizeFilename(file.name);
  const uploadPath = `${userId}/${type}/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  return uploadBytes({
    bucket: STORAGE_BUCKETS.instituteDocuments,
    uploadPath,
    bytes,
    contentType: file.type,
  });
}

export async function uploadAvatar({ userId, file }: { userId: string; file: File }) {
  const extension = extFromMime(file.type);
  const uploadPath = `${userId}/avatar.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  return uploadBytes({
    bucket: STORAGE_BUCKETS.avatars,
    uploadPath,
    bytes,
    contentType: file.type,
    upsert: true,
  });
}

function courseMediaFolderByMime(mimeType: string): "images" | "videos" | "documents" {
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType.startsWith("video/")) return "videos";
  return "documents";
}

export async function uploadCourseMedia({
  userId,
  courseId,
  file,
}: {
  userId: string;
  courseId: string;
  file: File;
}) {
  const filename = sanitizeFilename(file.name);
  const folder = courseMediaFolderByMime(file.type);
  const uploadPath = `${userId}/${courseId}/${folder}/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  return uploadBytes({
    bucket: STORAGE_BUCKETS.courseMedia,
    uploadPath,
    bytes,
    contentType: file.type,
  });
}

export async function uploadBlogMedia({
  userId,
  blogId,
  file,
  mediaKind,
}: {
  userId: string;
  blogId: string;
  file: File;
  mediaKind: "cover" | "inline";
}) {
  const filename = sanitizeFilename(file.name);
  const uploadPath = `${userId}/${blogId}/${mediaKind}/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  return uploadBytes({
    bucket: STORAGE_BUCKETS.blogMedia,
    uploadPath,
    bytes,
    contentType: file.type,
  });
}

export async function uploadPsychometricReport({
  userId,
  attemptId,
  pdfBuffer,
}: {
  userId: string;
  attemptId: string;
  pdfBuffer: Buffer;
}) {
  const uploadPath = `${userId}/${attemptId}/report.pdf`;

  return uploadBytes({
    bucket: STORAGE_BUCKETS.psychometricReports,
    uploadPath,
    bytes: pdfBuffer,
    contentType: "application/pdf",
    upsert: true,
  });
}

export async function deleteFromBucket(bucket: StorageBucket, pathToDelete: string) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  const { error } = await admin.data.storage.from(bucket).remove([pathToDelete]);
  return { error: error?.message ?? null };
}

function normalizeStoragePath(fileRef: string | null | undefined, bucket: StorageBucket) {
  if (!fileRef) return null;
  if (/^https?:\/\//i.test(fileRef)) {
    const marker = `/object/public/${bucket}/`;
    const idx = fileRef.indexOf(marker);
    if (idx >= 0) return fileRef.slice(idx + marker.length);
    return null;
  }
  return fileRef.replace(/^\/+/, "");
}

export async function getSignedPrivateFileUrl({
  bucket,
  fileRef,
  expiresIn = 60 * 10,
}: {
  bucket: "user-documents" | "institute-documents" | "psychometric-reports";
  fileRef: string | null | undefined;
  expiresIn?: number;
}) {
  const path = normalizeStoragePath(fileRef, bucket);
  if (!path) return null;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return null;

  const { data, error } = await admin.data.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function getPublicFileUrl({ bucket, path: pathValue }: { bucket: "avatars" | "course-media" | "blog-media"; path: string }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return null;
  return admin.data.storage.from(bucket).getPublicUrl(pathValue).data.publicUrl;
}
