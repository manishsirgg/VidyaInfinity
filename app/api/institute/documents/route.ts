import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { documentType, documentUrl } = await request.json();

  if (!documentType || !documentUrl) {
    return NextResponse.json({ error: "documentType and documentUrl are required" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { error } = await admin.data.from("institute_documents").insert({
    institute_id: institute.id,
    document_type: documentType,
    document_url: documentUrl,
    verification_status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
