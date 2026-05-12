import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "psychometric-media";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

type MediaKind = "banner" | "thumbnail";

function getExtension(file: File) {
  const lower = (file.name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(lower)) return lower === "jpeg" ? "jpg" : lower;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function getTimestampPath() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const auth = await requireApiUser("admin");
  if ("error" in auth) {
    console.warn("[psychometric-media] unauthorized upload attempt", { testId });
    return auth.error;
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const formData = await request.formData();
  const file = formData.get("file");
  const kindValue = String(formData.get("kind") || "banner");
  const kind: MediaKind = kindValue === "thumbnail" ? "thumbnail" : "banner";

  if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return NextResponse.json({ error: "Unsupported file type. Use JPG, PNG, or WEBP." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File too large. Max 10 MB." }, { status: 400 });

  const { data: current, error: currentErr } = await admin.data
    .from("psychometric_tests")
    .select("id,banner_path,thumbnail_path")
    .eq("id", testId)
    .single();
  if (currentErr || !current) return NextResponse.json({ error: "Psychometric test not found." }, { status: 404 });

  const ext = getExtension(file);
  const objectPath = `psychometric-tests/${testId}/${kind}-${getTimestampPath()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.data.storage.from(BUCKET).upload(objectPath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("[psychometric-media] upload failed", { testId, kind, message: uploadError.message });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 400 });
  }

  const publicUrl = admin.data.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  const oldPath = kind === "banner" ? current.banner_path : current.thumbnail_path;
  const updatePayload = kind === "banner"
    ? { banner_url: publicUrl, banner_path: objectPath }
    : { thumbnail_url: publicUrl, thumbnail_path: objectPath };

  const { data: updated, error: updateErr } = await admin.data
    .from("psychometric_tests")
    .update(updatePayload)
    .eq("id", testId)
    .select("id,banner_url,banner_path,thumbnail_url,thumbnail_path,banner_alt_text")
    .single();

  if (updateErr || !updated) {
    console.error("[psychometric-media] db update failed", { testId, kind, message: updateErr?.message });
    await admin.data.storage.from(BUCKET).remove([objectPath]);
    return NextResponse.json({ error: "Could not save media details." }, { status: 400 });
  }

  if (oldPath && oldPath !== objectPath) {
    const { error: removeErr } = await admin.data.storage.from(BUCKET).remove([oldPath]);
    if (removeErr) console.error("[psychometric-media] old file delete failed", { testId, kind, path: oldPath, message: removeErr.message });
  }

  return NextResponse.json({ data: updated, message: `${kind} uploaded.` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const auth = await requireApiUser("admin");
  if ("error" in auth) {
    console.warn("[psychometric-media] unauthorized delete attempt", { testId });
    return auth.error;
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { kind }: { kind?: MediaKind } = await request.json().catch(() => ({}));
  if (!kind || (kind !== "banner" && kind !== "thumbnail")) {
    return NextResponse.json({ error: "kind must be banner or thumbnail." }, { status: 400 });
  }

  const { data: current, error: currentErr } = await admin.data
    .from("psychometric_tests")
    .select("id,banner_path,thumbnail_path")
    .eq("id", testId)
    .single();
  if (currentErr || !current) return NextResponse.json({ error: "Psychometric test not found." }, { status: 404 });

  const oldPath = kind === "banner" ? current.banner_path : current.thumbnail_path;
  if (oldPath) {
    const { error: removeErr } = await admin.data.storage.from(BUCKET).remove([oldPath]);
    if (removeErr) {
      console.error("[psychometric-media] delete failed", { testId, kind, path: oldPath, message: removeErr.message });
      return NextResponse.json({ error: "Could not delete media from storage." }, { status: 400 });
    }
  }

  const payload = kind === "banner" ? { banner_url: null, banner_path: null } : { thumbnail_url: null, thumbnail_path: null };
  const { data: updated, error: updateErr } = await admin.data
    .from("psychometric_tests")
    .update(payload)
    .eq("id", testId)
    .select("id,banner_url,banner_path,thumbnail_url,thumbnail_path,banner_alt_text")
    .single();
  if (updateErr || !updated) {
    console.error("[psychometric-media] db nulling failed", { testId, kind, message: updateErr?.message });
    return NextResponse.json({ error: "Could not update test media fields." }, { status: 400 });
  }

  return NextResponse.json({ data: updated, message: `${kind} deleted.` });
}
