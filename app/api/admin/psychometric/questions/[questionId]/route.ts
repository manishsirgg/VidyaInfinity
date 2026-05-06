import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const isChoice = (type?: string) => type === "single_choice" || type === "multiple_choice";

export async function PATCH(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const body = await request.json();
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { psychometric_question_options: options, ...questionBody } = body;
  if (!String(questionBody.question_text ?? "").trim()) return NextResponse.json({ error: "question_text is required" }, { status: 400 });
  if (!String(questionBody.question_type ?? "").trim()) return NextResponse.json({ error: "question_type is required" }, { status: 400 });
  if (questionBody.question_type === "scale" && !(Number(questionBody.min_scale_value) < Number(questionBody.max_scale_value))) return NextResponse.json({ error: "scale requires min < max" }, { status: 400 });

  const { data, error } = await admin.data.from("psychometric_questions").update({ ...questionBody, weight: Number(questionBody.weight ?? 1) }).eq("id", questionId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (isChoice(data.question_type)) {
    const activeOptions = (Array.isArray(options) ? options : []).filter((o: { is_active?: boolean }) => o.is_active ?? true);
    if (activeOptions.length < 2) return NextResponse.json({ error: "Choice questions require at least 2 active options" }, { status: 400 });
    for (const option of activeOptions) {
      if (!String(option.option_text ?? "").trim()) return NextResponse.json({ error: "option_text is required" }, { status: 400 });
      if (Number.isNaN(Number(option.score_value ?? 0))) return NextResponse.json({ error: "score_value must be numeric" }, { status: 400 });
    }
    const normalized = (Array.isArray(options) ? options : []).map((o: Record<string, unknown>, index: number) => ({ id: o.id as string | undefined, question_id: questionId, option_text: String(o.option_text ?? "").trim(), option_value: (o.option_value as string | null) ?? null, score_value: Number(o.score_value ?? 0), sort_order: Number(o.sort_order ?? index + 1), is_active: o.is_active ?? true }));
    for (const option of normalized) {
      if (option.id) await admin.data.from("psychometric_question_options").update(option).eq("id", option.id);
      else await admin.data.from("psychometric_question_options").insert(option);
    }
  }

  return NextResponse.json({ data });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { error } = await admin.data.from("psychometric_questions").update({ is_active: false }).eq("id", questionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
