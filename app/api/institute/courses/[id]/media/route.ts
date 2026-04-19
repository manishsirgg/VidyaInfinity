import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { uploadCourseMedia } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

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

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return NextResponse.json({ error: "Only image and video files are allowed for course media" }, { status: 400 });
  }

  const uploaded = await uploadCourseMedia({
    userId: user.id,
    courseId: course.id,
    file,
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  if (!uploaded.path || !uploaded.publicUrl) {
    return NextResponse.json({ error: "Failed to upload course media" }, { status: 500 });
  }

  const mediaType = file.type.startsWith("video/") ? "video" : "image";

  const { error: mediaError } = await admin.data.from("course_media").insert({
    course_id: course.id,
    file_url: uploaded.publicUrl,
    type: mediaType,
    storage_path: uploaded.path,
  });

  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
