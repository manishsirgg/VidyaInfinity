import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/uploads";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();

  const title = String(form.get("title") ?? "");
  const summary = String(form.get("summary") ?? "");
  const description = form.get("description") ? String(form.get("description")) : null;
  const feeAmount = Number(form.get("feeAmount") ?? 0);
  const file = form.get("media");

  if (!title || !summary || !feeAmount) {
    return NextResponse.json({ error: "title, summary, feeAmount are required" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course, error } = await admin.data
    .from("courses")
    .insert({
      institute_id: institute.id,
      title,
      slug: `${toSlug(title)}-${crypto.randomUUID().slice(0, 8)}`,
      summary,
      description,
      fee_amount: feeAmount,
      approval_status: "pending",
      rejection_reason: null,
    })
    .select("id")
    .single();

  if (error || !course) return NextResponse.json({ error: error?.message ?? "Failed to create course" }, { status: 500 });

  if (file instanceof File) {
    const uploaded = await uploadToBucket({
      bucket: "course-media",
      file,
      ownerId: user.id,
      folder: "course-media",
    });

    if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    const { error: mediaError } = await admin.data.from("course_media").insert({
      course_id: course.id,
      media_type: mediaType,
      media_url: uploaded.publicUrl,
      storage_path: uploaded.path,
    });

    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, courseId: course.id });
}
