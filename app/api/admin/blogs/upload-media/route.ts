import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { uploadToBucket } from "@/lib/storage/uploads";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const uploaded = await uploadToBucket({
    bucket: "blog-media",
    file,
    ownerId: auth.user.id,
    folder: "blogs",
  });

  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, url: uploaded.publicUrl, path: uploaded.path });
}
