import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { uploadCourseMedia } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

const MAX_MEDIA_FILES_PER_COURSE = 10;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

function isMissingStoragePathColumnError(message?: string) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("storage_path") && normalized.includes("column");
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireApiUser("institute", { requireApproved: false });
    if ("error" in auth) return auth.error;

    const { user } = auth;
    const { id: courseId } = await params;

    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: 500 });
    }

    const { data: institute, error: instituteError } = await admin.data
      .from("institutes")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (instituteError) {
      return NextResponse.json({ error: instituteError.message }, { status: 500 });
    }

    if (!institute?.id) {
      return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
    }

    const { data: course, error: courseError } = await admin.data
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("institute_id", institute.id)
      .maybeSingle();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    if (!course?.id) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const { count: mediaCount, error: mediaCountError } = await admin.data
      .from("course_media")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id);

    if (mediaCountError) {
      return NextResponse.json({ error: mediaCountError.message }, { status: 500 });
    }

    if ((mediaCount ?? 0) >= MAX_MEDIA_FILES_PER_COURSE) {
      return NextResponse.json({ error: `A maximum of ${MAX_MEDIA_FILES_PER_COURSE} media files is allowed per course.` }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | {
            path?: string;
            publicUrl?: string;
            fileType?: string;
          }
        | null;

      const path = String(body?.path ?? "").trim();
      const publicUrl = String(body?.publicUrl ?? "").trim();
      const fileType = String(body?.fileType ?? "").trim();

      if (!path || !fileType) {
        return NextResponse.json({ error: "path and fileType are required" }, { status: 400 });
      }

      if (!fileType.startsWith("image/") && !fileType.startsWith("video/")) {
        return NextResponse.json({ error: "Only image and video files are allowed for course media" }, { status: 400 });
      }

      const mediaType = fileType.startsWith("video/") ? "video" : "image";

      const mediaPayload = {
        course_id: course.id,
        file_url: publicUrl || path,
        type: mediaType,
        storage_path: path,
      };

      const { error: mediaError } = await admin.data.from("course_media").insert(mediaPayload);

      if (mediaError && isMissingStoragePathColumnError(mediaError.message)) {
        const { error: fallbackInsertError } = await admin.data.from("course_media").insert({
          course_id: course.id,
          file_url: publicUrl || path,
          type: mediaType,
        });

        if (fallbackInsertError) {
          return NextResponse.json({ error: `Course media record insert failed: ${fallbackInsertError.message}` }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
      }

      if (mediaError) {
        return NextResponse.json({ error: `Course media record insert failed: ${mediaError.message}` }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // Legacy multipart fallback for smaller files.
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.type.startsWith("image/") && file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Upload failed for ${file.name}: Image files must be 10MB or smaller.`,
        },
        { status: 400 }
      );
    }

    if (file.type.startsWith("video/") && file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Upload failed for ${file.name}: Video files must be 50MB or smaller.`,
        },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Only image and video files are allowed for course media" }, { status: 400 });
    }

    const uploaded = await uploadCourseMedia({
      userId: user.id,
      courseId: course.id,
      file,
    });

    if (uploaded.error) {
      return NextResponse.json({ error: `Upload failed for ${file.name}: ${uploaded.error}` }, { status: 400 });
    }

    if (!uploaded.path) {
      return NextResponse.json({ error: `Upload failed for ${file.name}: Storage path was not returned by server.` }, { status: 500 });
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    const { error: mediaError } = await admin.data.from("course_media").insert({
      course_id: course.id,
      file_url: uploaded.publicUrl ?? uploaded.path,
      type: mediaType,
      storage_path: uploaded.path,
    });

    if (mediaError) {
      return NextResponse.json({ error: `Course media record insert failed for ${file.name}: ${mediaError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: `Unhandled course media upload error: ${message}` }, { status: 500 });
  }
}


export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as { mediaId?: string } | null;
  const mediaId = String(body?.mediaId ?? "").trim();

  if (!mediaId) return NextResponse.json({ error: "mediaId is required" }, { status: 400 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course } = await admin.data.from("courses").select("id").eq("id", courseId).eq("institute_id", institute.id).maybeSingle<{ id: string }>();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data: mediaWithPath } = await admin.data.from("course_media").select("id,storage_path").eq("id", mediaId).eq("course_id", courseId).maybeSingle<{ id: string; storage_path?: string | null }>();
  const media = mediaWithPath
    ? mediaWithPath
    : await admin.data
        .from("course_media")
        .select("id")
        .eq("id", mediaId)
        .eq("course_id", courseId)
        .maybeSingle<{ id: string }>()
        .then((res) => (res.data ? { ...res.data, storage_path: null } : null));
  if (!media) return NextResponse.json({ error: "Media not found" }, { status: 404 });

  const { error: deleteError } = await admin.data.from("course_media").delete().eq("id", mediaId).eq("course_id", courseId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (media.storage_path) {
    await admin.data.storage.from("course-media").remove([media.storage_path]);
  }

  return NextResponse.json({ ok: true });
}
