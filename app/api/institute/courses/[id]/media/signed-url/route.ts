import path from "node:path";

import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

function sanitizeFilename(filename: string) {
  const base = path.basename(filename || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function courseMediaFolderByMime(mimeType: string): "images" | "videos" {
  return mimeType.startsWith("video/") ? "videos" : "images";
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

    const body = (await request.json().catch(() => null)) as
      | {
          fileName?: string;
          fileType?: string;
          fileSize?: number;
        }
      | null;

    const fileName = String(body?.fileName ?? "").trim();
    const fileType = String(body?.fileType ?? "").trim();
    const fileSize = Number(body?.fileSize ?? 0);

    if (!fileName || !fileType || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "fileName, fileType and fileSize are required" }, { status: 400 });
    }

    if (!fileType.startsWith("image/") && !fileType.startsWith("video/")) {
      return NextResponse.json({ error: "Only image and video files are allowed for course media" }, { status: 400 });
    }

    if (fileType.startsWith("image/") && fileSize > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "Image files must be 10MB or smaller." }, { status: 400 });
    }

    if (fileType.startsWith("video/") && fileSize > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json({ error: "Video files must be 50MB or smaller." }, { status: 400 });
    }

    const filename = sanitizeFilename(fileName);
    const folder = courseMediaFolderByMime(fileType);
    const uploadPath = `${user.id}/${course.id}/${folder}/${Date.now()}-${filename}`;

    const { data: signedData, error: signedError } = await admin.data.storage
      .from("course-media")
      .createSignedUploadUrl(uploadPath);

    if (signedError || !signedData?.token) {
      return NextResponse.json({ error: signedError?.message ?? "Could not generate upload URL" }, { status: 500 });
    }

    const publicUrl = admin.data.storage.from("course-media").getPublicUrl(uploadPath).data.publicUrl;

    return NextResponse.json({
      token: signedData.token,
      path: uploadPath,
      publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: `Unhandled signed upload URL error: ${message}` }, { status: 500 });
  }
}
