import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const isChoice = (type?: string) => type === "single_choice" || type === "multiple_choice";

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
  if (!String(question.question_text ?? "").trim()) return NextResponse.json({ error: "question_text is required" }, { status: 400 });
  if (!String(question.question_type ?? "").trim()) return NextResponse.json({ error: "question_type is required" }, { status: 400 });
  if (question.question_type === "scale" && !(Number(question.min_scale_value) < Number(question.max_scale_value))) return NextResponse.json({ error: "scale requires min < max" }, { status: 400 });

  const activeOptions = (Array.isArray(options) ? options : []).filter((o: { is_active?: boolean }) => o.is_active ?? true);
  if (isChoice(question.question_type) && activeOptions.length < 2) return NextResponse.json({ error: "Choice questions require at least 2 active options" }, { status: 400 });
  for (const option of activeOptions) {
    if (!String(option.option_text ?? "").trim()) return NextResponse.json({ error: "option_text is required" }, { status: 400 });
    if (Number.isNaN(Number(option.score_value ?? 0))) return NextResponse.json({ error: "score_value must be numeric" }, { status: 400 });
  }

  const { data: created, error } = await admin.data.from("psychometric_questions").insert({ ...question, weight: Number(question.weight ?? 1), test_id: testId }).select("*").single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 400 });
  if (Array.isArray(options) && options.length && isChoice(created.question_type)) {
    const payload = options.map((o: Record<string, unknown>, index: number) => ({ question_id: created.id, option_text: String(o.option_text ?? "").trim(), option_value: o.option_value ?? null, score_value: Number(o.score_value ?? 0), sort_order: Number(o.sort_order ?? index + 1), is_active: o.is_active ?? true }));
    const { error: optionError } = await admin.data.from("psychometric_question_options").insert(payload);
    if (optionError) return NextResponse.json({ error: optionError.message }, { status: 400 });
  }
  return NextResponse.json({ data: created });
}
