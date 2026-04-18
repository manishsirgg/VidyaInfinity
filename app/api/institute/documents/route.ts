import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { isInstituteApprovalDocumentSubtype } from "@/lib/constants/institute-documents";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadInstituteDocument } from "@/lib/storage/uploads";

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
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
  if (!isInstituteApprovalDocumentSubtype(documentType)) {
    return NextResponse.json({ error: "Invalid documentType" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const uploaded = await uploadInstituteDocument({
    userId: user.id,
    file,
    type: "approval",
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  if (!uploaded.path) return NextResponse.json({ error: "Unable to store document" }, { status: 500 });

  const { error: insertError } = await admin.data.from("institute_documents").insert({
    institute_id: institute.id,
    type: "approval",
    subtype: documentType,
    document_url: uploaded.path,
    status: "pending",
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const now = new Date().toISOString();

  const { error: instituteUpdateError } = await admin.data
    .from("institutes")
    .update({ status: "pending", rejection_reason: null, verified: false, updated_at: now })
    .eq("id", institute.id);

  if (instituteUpdateError) return NextResponse.json({ error: instituteUpdateError.message }, { status: 500 });

  const { error: profileUpdateError } = await admin.data
    .from("profiles")
    .update({ approval_status: "pending", rejection_reason: null })
    .eq("id", user.id);

  if (profileUpdateError) return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, path: uploaded.path });
}
