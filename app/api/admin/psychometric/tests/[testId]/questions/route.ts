import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ testId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { testId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data, error } = await admin.data.from("psychometric_questions").select("*,psychometric_question_options(*)").eq("test_id", testId).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { testId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const body = await request.json();
  const { options, ...question } = body;
  const { data: created, error } = await admin.data.from("psychometric_questions").insert({ ...question, test_id: testId }).select("*").single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 400 });
  if (Array.isArray(options) && options.length && ["single_choice","multiple_choice"].includes(created.question_type)) {
    const payload = options.map((o: Record<string, unknown>) => ({ question_id: created.id, option_text: o.option_text, option_value: o.option_value ?? null, score_value: Number(o.score_value ?? 0), sort_order: Number(o.sort_order ?? 0), is_active: o.is_active ?? true }));
    const { error: optionError } = await admin.data.from("psychometric_question_options").insert(payload);
    if (optionError) return NextResponse.json({ error: optionError.message }, { status: 400 });
  }
  return NextResponse.json({ data: created });
}
