import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/uploads";

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();
  const documentType = String(form.get("documentType") ?? "");
  const file = form.get("file");

  if (!documentType || !(file instanceof File)) {
    return NextResponse.json({ error: "documentType and file are required" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const uploaded = await uploadToBucket({
    bucket: "institute-documents",
    file,
    ownerId: user.id,
    folder: "documents",
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  const { error } = await admin.data.from("institute_documents").insert({
    institute_id: institute.id,
    document_type: documentType,
    document_url: uploaded.publicUrl,
    storage_path: uploaded.path,
    verification_status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, url: uploaded.publicUrl });
}
