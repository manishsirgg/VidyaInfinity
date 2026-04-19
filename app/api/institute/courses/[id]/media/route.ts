import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { uploadCourseMedia } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

function isMissingStoragePathColumnError(message?: string) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("storage_path") && normalized.includes("column");
}

export async function POST(request: Request, { params }: Params) {
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

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return NextResponse.json(
      { error: "Only image and video files are allowed for course media" },
      { status: 400 }
    );
  }

  const uploaded = await uploadCourseMedia({
    userId: user.id,
    courseId: course.id,
    file,
  });

  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  if (!uploaded.path) {
    return NextResponse.json({ error: "Failed to upload course media" }, { status: 500 });
  }

  const mediaType = file.type.startsWith("video/") ? "video" : "image";

  const mediaPayload = {
    course_id: course.id,
    file_url: uploaded.publicUrl ?? uploaded.path,
    type: mediaType,
    storage_path: uploaded.path,
  };

  const { error: mediaError } = await admin.data
    .from("course_media")
    .insert(mediaPayload);

  if (mediaError && isMissingStoragePathColumnError(mediaError.message)) {
    const { error: fallbackInsertError } = await admin.data
      .from("course_media")
      .insert({
        course_id: course.id,
        file_url: uploaded.publicUrl ?? uploaded.path,
        type: mediaType,
      });

    if (fallbackInsertError) {
      return NextResponse.json({ error: fallbackInsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
