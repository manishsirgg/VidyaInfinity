import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadInstituteDocument } from "@/lib/storage/uploads";

function toFolderType(documentType: string): "approval" | "registration" | "accreditation" {
  if (documentType.includes("accredit")) return "accreditation";
  if (documentType.includes("registr")) return "registration";
  return "approval";
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();
  const documentType = String(form.get("documentType") ?? "").trim().toLowerCase();
  const file = form.get("file");

  if (!documentType || !(file instanceof File)) {
    return NextResponse.json({ error: "documentType and file are required" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const uploaded = await uploadInstituteDocument({
    userId: user.id,
    file,
    type: toFolderType(documentType),
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  if (!uploaded.path) return NextResponse.json({ error: "Unable to store document" }, { status: 500 });

  const { error: insertError } = await admin.data.from("institute_documents").insert({
    institute_id: institute.id,
    type: documentType,
    document_url: uploaded.path,
    status: "pending",
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, path: uploaded.path });
}
