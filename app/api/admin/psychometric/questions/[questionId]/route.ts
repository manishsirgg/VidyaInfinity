import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const body = await request.json();
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data, error } = await admin.data.from("psychometric_questions").update(body).eq("id", questionId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { error } = await admin.data.from("psychometric_questions").update({ is_active: false }).eq("id", questionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
