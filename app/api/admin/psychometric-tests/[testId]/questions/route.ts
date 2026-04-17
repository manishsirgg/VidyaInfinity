import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { testId } = await params;
  const { questionText, questionType, marks, options } = await request.json();

  if (!questionText || !Array.isArray(options) || !options.length) {
    return NextResponse.json({ error: "questionText and options are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: question, error: questionError } = await admin.data
    .from("psychometric_questions")
    .insert({
      test_id: testId,
      question_text: questionText,
      question_type: questionType ?? "single_choice",
      marks: marks ?? 1,
    })
    .select("id")
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: questionError?.message ?? "Failed to create question" }, { status: 500 });
  }

  const mappedOptions = options.map((option: { label: string; score: number; isCorrect?: boolean }, index: number) => ({
    question_id: question.id,
    option_label: option.label,
    score: Number(option.score ?? 0),
    is_correct: Boolean(option.isCorrect),
    sort_order: index,
  }));

  const { error: optionError } = await admin.data.from("psychometric_question_options").insert(mappedOptions);

  if (optionError) {
    return NextResponse.json({ error: optionError.message }, { status: 500 });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "PSYCHOMETRIC_QUESTION_CREATED",
    targetTable: "psychometric_questions",
    targetId: question.id,
    metadata: { testId, optionCount: mappedOptions.length },
  });

  return NextResponse.json({ ok: true, questionId: question.id });
}
