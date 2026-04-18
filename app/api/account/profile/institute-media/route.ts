import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPublicFileUrl, uploadInstituteMedia } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  if (auth.profile.role !== "institute") {
    return NextResponse.json({ error: "Institute media uploads are only available for institute accounts" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Only image and video files are allowed for institute media" }, { status: 400 });
  }

  const maxSize = isImage ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `${file.name} exceeds max ${(maxSize / 1024 / 1024).toFixed(0)}MB for ${isImage ? "images" : "videos"}` },
      { status: 400 }
    );
  }

  const { data: institute, error: instituteLookupError } = await admin.data
    .from("institutes")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle<{ id: string }>();

  if (instituteLookupError || !institute) {
    return NextResponse.json({ error: instituteLookupError?.message ?? "Institute record not found" }, { status: 500 });
  }

  const { count: existingMediaCount, error: mediaCountError } = await admin.data
    .from("institute_media")
    .select("id", { head: true, count: "exact" })
    .eq("institute_id", institute.id);

  if (mediaCountError) {
    return NextResponse.json({ error: mediaCountError.message }, { status: 500 });
  }
  if ((existingMediaCount ?? 0) >= 20) {
    return NextResponse.json({ error: "Institute showcase supports up to 20 media files in total" }, { status: 400 });
  }

  const uploadedMedia = await uploadInstituteMedia({ userId: auth.user.id, file });
  if (uploadedMedia.error || !uploadedMedia.path) {
    return NextResponse.json({ error: uploadedMedia.error ?? "Unable to upload institute media file" }, { status: 400 });
  }

  const payload = {
    institute_id: institute.id,
    file_url: uploadedMedia.path,
    media_type: isImage ? "image" : "video",
    file_name: file.name,
    file_size: file.size,
  };

  const { data: inserted, error: mediaInsertError } = await admin.data
    .from("institute_media")
    .insert(payload)
    .select("id,file_url,media_type,file_name,file_size,created_at")
    .maybeSingle<{
      id: string;
      file_url: string;
      media_type: "image" | "video";
      file_name: string | null;
      file_size: number | null;
      created_at: string;
    }>();

  if (mediaInsertError) {
    return NextResponse.json({ error: mediaInsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    media: inserted
      ? {
          ...inserted,
          publicUrl: getPublicFileUrl({ bucket: "institute-media", path: inserted.file_url }) ?? getPublicFileUrl({ bucket: "blog-media", path: inserted.file_url }),
        }
      : null,
  });
}
