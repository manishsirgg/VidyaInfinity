import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { attemptId } = await params;
  const { answers } = await request.json();

  if (!Array.isArray(answers) || !answers.length) {
    return NextResponse.json({ error: "answers array is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,status")
    .eq("id", attemptId)
    .eq("user_id", auth.user.id)
    .single();

  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  if (attempt.status === "completed") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const questionIds = answers.map((answer: { questionId: string }) => answer.questionId);
  const { data: options } = await admin.data
    .from("psychometric_question_options")
    .select("id,question_id,score")
    .in("question_id", questionIds);

  const optionMap = new Map((options ?? []).map((option) => [option.id, option]));

  const answerRows = answers.map((answer: { questionId: string; optionId: string }) => {
    const option = optionMap.get(answer.optionId);
    return {
      attempt_id: attempt.id,
      user_id: auth.user.id,
      test_id: attempt.test_id,
      question_id: answer.questionId,
      option_id: answer.optionId,
      score_awarded: option?.score ?? 0,
    };
  });

  const { error: deleteError } = await admin.data
    .from("psychometric_answers")
    .delete()
    .eq("attempt_id", attempt.id)
    .eq("user_id", auth.user.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: answerError } = await admin.data.from("psychometric_answers").insert(answerRows);
  if (answerError) return NextResponse.json({ error: answerError.message }, { status: 500 });

  const totalScore = answerRows.reduce((sum, item) => sum + Number(item.score_awarded ?? 0), 0);

  const report = {
    totalScore,
    submittedAt: new Date().toISOString(),
    questionsAnswered: answerRows.length,
    interpretation:
      totalScore >= 80 ? "Excellent alignment" : totalScore >= 50 ? "Moderate alignment" : "Needs guidance",
  };

  const reportBlob = new File([JSON.stringify(report, null, 2)], `attempt-${attempt.id}.json`, {
    type: "application/json",
  });

  const uploaded = await uploadToBucket({
    bucket: "psychometric-reports",
    file: reportBlob,
    ownerId: auth.user.id,
    folder: "reports",
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 500 });

  const { error: updateError } = await admin.data
    .from("test_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      score: totalScore,
      report_url: uploaded.publicUrl,
      report_storage_path: uploaded.path,
    })
    .eq("id", attempt.id)
    .eq("user_id", auth.user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, score: totalScore, reportUrl: uploaded.publicUrl, report });
}
