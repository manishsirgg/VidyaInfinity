import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data, error } = await admin.data.from("psychometric_question_options").select("*").eq("question_id", questionId).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
export async function POST(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const body = await request.json(); const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data, error } = await admin.data.from("psychometric_question_options").insert({ ...body, question_id: questionId }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
