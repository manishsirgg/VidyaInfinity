import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, INSTITUTE_UPDATE_IMAGE_BUCKET, INSTITUTE_UPDATE_VIDEO_BUCKET, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, getFileExtension, sanitizeContent } from "@/lib/institute-updates";

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  const { data, error } = await admin.data.from("institute_updates").select("*").eq("institute_id", institute.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updates: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const form = await request.formData();
  const content = sanitizeContent(form.get("content"));
  const saveAsDraft = String(form.get("saveAsDraft") ?? "false") === "true";
  const image = form.get("image");
  const video = form.get("video");
  if (image instanceof File && video instanceof File) return NextResponse.json({ error: "Upload either image or video, not both." }, { status: 400 });

  const { data: created, error: createError } = await admin.data.from("institute_updates").insert({
    institute_id: institute.id, created_by: auth.user.id, content, status: saveAsDraft ? "draft" : "pending_review",
  }).select("id").single<{id:string}>();
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Failed to create update" }, { status: 500 });

  const patch: Record<string, string | null> = {};
  if (image instanceof File) {
    if (!ALLOWED_IMAGE_TYPES.includes(image.type as never) || image.size > MAX_IMAGE_SIZE_BYTES) return NextResponse.json({ error: "Invalid image type/size." }, { status: 400 });
    const ext = getFileExtension(image.name, "jpg");
    const path = `${institute.id}/${created.id}/image.${ext}`;
    const up = await admin.data.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).upload(path, image, { upsert: true, contentType: image.type });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    patch.image_path = path; patch.image_url = admin.data.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (video instanceof File) {
    if (!ALLOWED_VIDEO_TYPES.includes(video.type as never) || video.size > MAX_VIDEO_SIZE_BYTES) return NextResponse.json({ error: "Invalid video type/size." }, { status: 400 });
    const ext = getFileExtension(video.name, "mp4");
    const path = `${institute.id}/${created.id}/video.${ext}`;
    const up = await admin.data.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).upload(path, video, { upsert: true, contentType: video.type });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    patch.video_path = path; patch.video_url = admin.data.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (Object.keys(patch).length) await admin.data.from("institute_updates").update(patch).eq("id", created.id).eq("institute_id", institute.id);
  return NextResponse.json({ ok: true, id: created.id });
}
