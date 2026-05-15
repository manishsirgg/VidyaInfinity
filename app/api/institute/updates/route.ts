import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, INSTITUTE_UPDATE_IMAGE_BUCKET, INSTITUTE_UPDATE_VIDEO_BUCKET, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, getFileExtension, sanitizeContent } from "@/lib/institute-updates";

async function getInstituteId(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: NextResponse.json({ error: admin.error }, { status: 500 }) };
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
  if (!institute) return { error: NextResponse.json({ error: "Institute record not found" }, { status: 404 }) };
  return { admin: admin.data, instituteId: institute.id };
}

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const scoped = await getInstituteId(auth.user.id);
  if ("error" in scoped) return scoped.error;
  const { data, error } = await scoped.admin.from("institute_updates").select("*").eq("institute_id", scoped.instituteId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updates: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const scoped = await getInstituteId(auth.user.id);
  if ("error" in scoped) return scoped.error;

  const form = await request.formData();
  const content = sanitizeContent(form.get("content"));
  const saveAsDraft = String(form.get("saveAsDraft") ?? "false") === "true";
  const image = form.get("image");
  const video = form.get("video");
  if (image instanceof File && video instanceof File) return NextResponse.json({ error: "Upload either image or video, not both." }, { status: 400 });

  const { data: created, error: createError } = await scoped.admin.from("institute_updates").insert({
    institute_id: scoped.instituteId, created_by: auth.user.id, content, status: saveAsDraft ? "draft" : "pending_review",
  }).select("id").single<{ id: string }>();
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Failed to create update" }, { status: 500 });

  const patch: Record<string, string | null> = {};
  if (image instanceof File) {
    if (!ALLOWED_IMAGE_TYPES.includes(image.type as never) || image.size > MAX_IMAGE_SIZE_BYTES) return NextResponse.json({ error: "Invalid image type/size." }, { status: 400 });
    const ext = getFileExtension(image.name, "jpg");
    const path = `${scoped.instituteId}/${created.id}/image.${ext}`;
    const up = await scoped.admin.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).upload(path, image, { upsert: true, contentType: image.type });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    patch.image_path = path; patch.image_url = scoped.admin.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (video instanceof File) {
    if (!ALLOWED_VIDEO_TYPES.includes(video.type as never) || video.size > MAX_VIDEO_SIZE_BYTES) return NextResponse.json({ error: "Invalid video type/size." }, { status: 400 });
    const ext = getFileExtension(video.name, "mp4");
    const path = `${scoped.instituteId}/${created.id}/video.${ext}`;
    const up = await scoped.admin.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).upload(path, video, { upsert: true, contentType: video.type });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    patch.video_path = path; patch.video_url = scoped.admin.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  if (Object.keys(patch).length) await scoped.admin.from("institute_updates").update(patch).eq("id", created.id).eq("institute_id", scoped.instituteId);
  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const scoped = await getInstituteId(auth.user.id);
  if ("error" in scoped) return scoped.error;

  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim();
  const action = String(form.get("action") ?? "replace");
  const content = sanitizeContent(form.get("content"));
  if (!id) return NextResponse.json({ error: "Update id is required" }, { status: 400 });

  const patch: Record<string, string | null> = { content };
  const image = form.get("image");
  const video = form.get("video");

  if (action === "remove") {
    patch.image_path = null; patch.image_url = null; patch.video_path = null; patch.video_url = null;
  } else if (action === "relocate") {
    const { data: current } = await scoped.admin.from("institute_updates").select("image_url,video_url").eq("id", id).eq("institute_id", scoped.instituteId).single<{ image_url?: string | null; video_url?: string | null }>();
    if (current?.image_url) patch.image_url = `${current.image_url}${current.image_url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    if (current?.video_url) patch.video_url = `${current.video_url}${current.video_url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  } else {
    if (image instanceof File && video instanceof File) return NextResponse.json({ error: "Upload either image or video, not both." }, { status: 400 });
    if (!(image instanceof File) && !(video instanceof File)) return NextResponse.json({ error: "Please choose an image or a video to replace." }, { status: 400 });

    if (image instanceof File) {
      if (!ALLOWED_IMAGE_TYPES.includes(image.type as never) || image.size > MAX_IMAGE_SIZE_BYTES) return NextResponse.json({ error: "Invalid image type/size." }, { status: 400 });
      const ext = getFileExtension(image.name, "jpg");
      const path = `${scoped.instituteId}/${id}/image.${ext}`;
      const up = await scoped.admin.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).upload(path, image, { upsert: true, contentType: image.type });
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
      patch.image_path = path; patch.image_url = scoped.admin.storage.from(INSTITUTE_UPDATE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      patch.video_path = null; patch.video_url = null;
    }
    if (video instanceof File) {
      if (!ALLOWED_VIDEO_TYPES.includes(video.type as never) || video.size > MAX_VIDEO_SIZE_BYTES) return NextResponse.json({ error: "Invalid video type/size." }, { status: 400 });
      const ext = getFileExtension(video.name, "mp4");
      const path = `${scoped.instituteId}/${id}/video.${ext}`;
      const up = await scoped.admin.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).upload(path, video, { upsert: true, contentType: video.type });
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
      patch.video_path = path; patch.video_url = scoped.admin.storage.from(INSTITUTE_UPDATE_VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
      patch.image_path = null; patch.image_url = null;
    }
  }

  const { data, error } = await scoped.admin.from("institute_updates").update(patch).eq("id", id).eq("institute_id", scoped.instituteId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, update: data });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const scoped = await getInstituteId(auth.user.id);
  if ("error" in scoped) return scoped.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Update id is required" }, { status: 400 });

  const { error } = await scoped.admin.from("institute_updates").delete().eq("id", id).eq("institute_id", scoped.instituteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
