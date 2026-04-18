import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("institutes")
    .select(
      "id,user_id,name,description,verified,status,rejection_reason,legal_entity_name,organization_type,registration_number,accreditation_affiliation_number,website_url,established_year,total_students,total_staff,created_at,updated_at"
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ institute: data });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const payload = await request.json();

  const { error } = await admin.data
    .from("institutes")
    .update({
      description: payload.description ?? null,
      website_url: payload.websiteUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
