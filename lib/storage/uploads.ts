import crypto from "node:crypto";
import path from "node:path";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const allowedMimeTypes: Record<string, string[]> = {
  "institute-documents": ["application/pdf", "image/png", "image/jpeg"],
  "course-media": ["image/png", "image/jpeg", "image/webp", "video/mp4"],
  "blog-media": ["image/png", "image/jpeg", "image/webp"],
  "psychometric-reports": ["application/json", "application/pdf"],
};

const maxSizeByBucket: Record<string, number> = {
  "institute-documents": 5 * 1024 * 1024,
  "course-media": 20 * 1024 * 1024,
  "blog-media": 10 * 1024 * 1024,
  "psychometric-reports": 10 * 1024 * 1024,
};

export async function uploadToBucket({
  bucket,
  file,
  ownerId,
  folder,
}: {
  bucket: keyof typeof allowedMimeTypes;
  file: File;
  ownerId: string;
  folder: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  if (!allowedMimeTypes[bucket].includes(file.type)) {
    return { error: `Unsupported file type ${file.type} for bucket ${bucket}` };
  }

  const maxSize = maxSizeByBucket[bucket];
  if (file.size > maxSize) {
    return { error: `File too large. Max allowed ${(maxSize / 1024 / 1024).toFixed(1)}MB` };
  }

  const ext = path.extname(file.name) || "";
  const safeExt = ext.length <= 10 ? ext : "";
  const key = `${folder}/${ownerId}/${crypto.randomUUID()}${safeExt}`;

  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.data.storage.from(bucket).upload(key, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) return { error: uploadError.message };

  const { data: publicData } = admin.data.storage.from(bucket).getPublicUrl(key);

  return {
    error: null,
    path: key,
    publicUrl: publicData.publicUrl,
  };
}
