import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const NEEDS_OPTIONS = new Set(["single_choice", "multiple_choice"]);

export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { testId } = await params;
  const { questionText, questionType, weight, minScaleValue, maxScaleValue, options } = await request.json();

  if (!String(questionText ?? "").trim()) return NextResponse.json({ error: "question_text required" }, { status: 400 });
  if (!String(questionType ?? "").trim()) return NextResponse.json({ error: "question_type required" }, { status: 400 });

  const type = String(questionType);
  const cleanOptions = Array.isArray(options)
    ? options.filter((option: { option_text?: string; label?: string; is_active?: boolean }) => (option.is_active ?? true) && String(option.option_text ?? option.label ?? "").trim())
    : [];

  if (NEEDS_OPTIONS.has(type) && cleanOptions.length < 2) {
    return NextResponse.json({ error: `${type} must have at least 2 active options` }, { status: 400 });
  }

  if (type === "scale" && !(Number(minScaleValue) < Number(maxScaleValue))) {
    return NextResponse.json({ error: "scale min must be less than max" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: question, error: questionError } = await admin.data
    .from("psychometric_questions")
    .insert({
      test_id: testId,
      question_text: questionText,
      question_type: type,
      weight: Number(weight ?? 1),
      min_scale_value: minScaleValue ?? null,
      max_scale_value: maxScaleValue ?? null,
    })
    .select("id")
    .single();

  if (questionError || !question) return NextResponse.json({ error: questionError?.message ?? "Failed to create question" }, { status: 500 });

  if (cleanOptions.length > 0) {
    const mappedOptions = cleanOptions.map((option: { option_text?: string; label?: string; score_value?: number; score?: number; is_correct?: boolean; isCorrect?: boolean }, index: number) => {
      const scoreValue = Number(option.score_value ?? option.score ?? 0);
      if (Number.isNaN(scoreValue)) throw new Error("score_value must be numeric");
      return {
        question_id: question.id,
        option_text: String(option.option_text ?? option.label ?? "").trim(),
        score_value: scoreValue,
        is_correct: Boolean(option.is_correct ?? option.isCorrect),
        sort_order: index,
        is_active: true,
      };
    });

    const { error: optionError } = await admin.data.from("psychometric_question_options").insert(mappedOptions);
    if (optionError) return NextResponse.json({ error: optionError.message }, { status: 500 });
  }

  await writeAdminAuditLog({ adminUserId: auth.user.id, action: "PSYCHOMETRIC_QUESTION_CREATED", targetTable: "psychometric_questions", targetId: question.id, metadata: { testId, optionCount: cleanOptions.length } });

  return NextResponse.json({ ok: true, questionId: question.id });
}
