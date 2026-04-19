import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { uploadCourseMedia } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

const MAX_COURSE_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_COURSE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);

function isMissingStoragePathColumnError(message: string | undefined) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("storage_path") && normalized.includes("column");
}

function isMediaTypeEnumError(message: string | undefined) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("media_type") && normalized.includes("invalid input value");
}

async function insertCourseMediaRecord(
  admin: any,
  payload: { course_id: string; file_url: string; type: string; storage_path: string }
) {
  const attempts = [payload, { ...payload, type: payload.type.toUpperCase() }];

  for (const attempt of attempts) {
    const { error } = await admin.from("course_media").insert(attempt);
    if (!error) return { error: null as null };
    if (isMissingStoragePathColumnError(error.message)) {
      const { error: fallbackError } = await admin.from("course_media").insert({
        course_id: attempt.course_id,
        file_url: attempt.file_url,
        type: attempt.type,
      });
      if (!fallbackError) return { error: null as null };
      if (!isMediaTypeEnumError(fallbackError.message)) return { error: fallbackError };
      continue;
    }
    if (!isMediaTypeEnumError(error.message)) return { error };
  }

  const { error } = await admin.from("course_media").insert({
    course_id: payload.course_id,
    file_url: payload.file_url,
    type: payload.type,
  });
  return { error };
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id: courseId } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course } = await admin.data
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("institute_id", institute.id)
    .maybeSingle<{ id: string }>();

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_COURSE_MEDIA_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported media type: ${file.type || "unknown"}. Allowed types: image/png, image/jpeg, image/webp, video/mp4.` },
      { status: 400 }
    );
  }

  if (file.size > MAX_COURSE_MEDIA_BYTES) {
    return NextResponse.json({ error: "File too large. Max allowed 50MB per file." }, { status: 400 });
  }

  const uploaded = await uploadCourseMedia({
    userId: user.id,
    courseId: course.id,
    file,
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  if (!uploaded.path) return NextResponse.json({ error: "Upload succeeded but storage path is missing." }, { status: 500 });

  const mediaType = file.type.startsWith("video/") ? "video" : "image";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const resolvedFileUrl =
    uploaded.publicUrl ?? (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/course-media/${uploaded.path}` : uploaded.path);

  const mediaPayload = {
    course_id: course.id,
    file_url: resolvedFileUrl,
    type: mediaType,
    storage_path: uploaded.path,
  };

  const { error: mediaError } = await insertCourseMediaRecord(admin.data, mediaPayload);

  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
