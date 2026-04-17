import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadBlogMedia } from "@/lib/storage/uploads";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const blogId = String(form.get("blogId") ?? "draft").trim() || "draft";
  const mediaKind = String(form.get("mediaKind") ?? "inline").trim().toLowerCase() === "cover" ? "cover" : "inline";

  const uploaded = await uploadBlogMedia({
    userId: auth.user.id,
    blogId,
    file,
    mediaKind,
  });

  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  if (!uploaded.path || !uploaded.publicUrl) {
    return NextResponse.json({ error: "Unable to upload blog media" }, { status: 500 });
  }

  if (blogId !== "draft") {
    const { error: insertError } = await admin.data.from("blog_media").insert({
      blog_id: blogId,
      media_type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document",
      file_url: uploaded.publicUrl,
      alt_text: String(form.get("altText") ?? "").trim() || null,
      caption: String(form.get("caption") ?? "").trim() || null,
      sort_order: Number(form.get("sortOrder") ?? 0) || 0,
      is_cover: mediaKind === "cover",
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, url: uploaded.publicUrl, path: uploaded.path });
}
