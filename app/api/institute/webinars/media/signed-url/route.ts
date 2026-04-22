import path from "node:path";

import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(filename: string) {
  const base = path.basename(filename || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 500 });
  }

  const { data: institute, error: instituteError } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle();
  if (instituteError) {
    return NextResponse.json({ error: instituteError.message }, { status: 500 });
  }
  if (!institute?.id) {
    return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        fileName?: string;
        fileType?: string;
        fileSize?: number;
        kind?: "thumbnail" | "banner";
      }
    | null;

  const fileName = String(body?.fileName ?? "").trim();
  const fileType = String(body?.fileType ?? "").trim().toLowerCase();
  const fileSize = Number(body?.fileSize ?? 0);
  const kind = body?.kind === "banner" ? "banner" : "thumbnail";

  if (!fileName || !fileType || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "fileName, fileType and fileSize are required" }, { status: 400 });
  }

  if (!fileType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
  }

  if (fileSize > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "Image files must be 10MB or smaller." }, { status: 400 });
  }

  const filename = sanitizeFilename(fileName);
  const uploadPath = `${auth.user.id}/webinars/${kind}/${Date.now()}-${filename}`;

  const { data: signedData, error: signedError } = await admin.data.storage.from("institute-media").createSignedUploadUrl(uploadPath);
  if (signedError || !signedData?.token) {
    return NextResponse.json({ error: signedError?.message ?? "Could not generate upload URL" }, { status: 500 });
  }

  const publicUrl = admin.data.storage.from("institute-media").getPublicUrl(uploadPath).data.publicUrl;

  return NextResponse.json({ token: signedData.token, path: uploadPath, publicUrl });
}
