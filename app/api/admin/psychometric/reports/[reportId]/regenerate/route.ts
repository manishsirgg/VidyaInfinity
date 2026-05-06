import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { computePsychometricReportData } from "@/lib/psychometric/scoring";
import { pickResultBand } from "@/lib/psychometric/reporting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { reportId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: report, error: reportError } = await admin.data
    .from("psychometric_reports")
    .select("id,attempt_id,test_id,user_id,order_id")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError || !report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const { data: attempt } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,order_id,score")
    .eq("id", report.attempt_id)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Linked attempt not found" }, { status: 404 });

  const [{ data: test }, { data: order }, { data: user }, { data: questions }] = await Promise.all([
    admin.data.from("psychometric_tests").select("id,title,scoring_config").eq("id", attempt.test_id).maybeSingle(),
    admin.data.from("psychometric_orders").select("id,user_id,payment_status,paid_at,final_amount").eq("id", report.order_id ?? attempt.order_id ?? "").maybeSingle(),
    admin.data.from("profiles").select("id").eq("id", attempt.user_id).maybeSingle(),
    admin.data.from("psychometric_questions").select("id,question_text,question_type,is_required,weight,min_scale_value,max_scale_value,metadata,scoring_config").eq("test_id", attempt.test_id).eq("is_active", true).order("sort_order"),
  ]);

  if (!test) return NextResponse.json({ error: "Linked test not found" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Linked user not found" }, { status: 404 });

  const qIds = (questions ?? []).map((q) => q.id);
  const [{ data: options }, { data: answers }] = await Promise.all([
    admin.data.from("psychometric_question_options").select("id,question_id,score_value,metadata").in("question_id", qIds).eq("is_active", true).order("sort_order"),
    admin.data.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text,awarded_score,test_id,user_id,attempt_id").eq("attempt_id", report.attempt_id).eq("test_id", report.test_id).eq("user_id", report.user_id),
  ]);

  if (!answers || answers.length === 0) return NextResponse.json({ error: "No saved answers found for this report attempt." }, { status: 400 });

  const scoring = computePsychometricReportData({
    test: test as { title: string | null; scoring_config: Record<string, unknown> | null },
    questions: (questions ?? []) as Array<{ id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null; scoring_config: Record<string, unknown> | null }>,
    options: (options ?? []) as Array<{ id: string; question_id: string; score_value: number | null; metadata: Record<string, unknown> | null }>,
    answers: (answers ?? []) as Array<{ id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null; awarded_score: number | string | null }>,
    enforceRequired: true,
  });

  const totalScore = (answers ?? []).reduce((sum, answer) => sum + Number(answer.awarded_score ?? 0), 0);
  const maxScore = scoring.max;
  const percentageUnclamped = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  const percentageScore = Number(Math.min(100, Math.max(0, percentageUnclamped)).toFixed(2));
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentageScore, bands);
  const content = scoring.content;
  const answersSnapshot = (answers ?? []).map((answer) => ({
    id: answer.id,
    attempt_id: answer.attempt_id,
    question_id: answer.question_id,
    option_id: answer.option_id,
    selected_values: answer.selected_values,
    numeric_value: answer.numeric_value,
    answer_text: answer.answer_text,
    awarded_score: Number(answer.awarded_score ?? 0),
    test_id: answer.test_id,
    user_id: answer.user_id,
  }));

  const now = new Date().toISOString();
  const { error: updateReportError } = await admin.data.from("psychometric_reports").update({
    test_id: attempt.test_id,
    user_id: attempt.user_id,
    order_id: report.order_id ?? attempt.order_id ?? order?.id ?? null,
    total_score: totalScore,
    max_score: maxScore,
    percentage_score: percentageScore,
    result_band: resultBand,
    summary: content.summary,
    strengths: content.strengths,
    improvement_areas: content.improvementAreas,
    recommendations: content.recommendations,
    dimension_scores: scoring.dimension,
    answers_snapshot: answersSnapshot,
    report_html: `<h1>Vidya Infinity Psychometric Report</h1><p>${content.summary}</p><p>Total Score: ${totalScore} / ${maxScore} (${percentageScore}%)</p><p>Result Band: ${resultBand}</p>`,
    report_json: { totalScore, maxScore, percentageScore, resultBand, disclaimer: content.recommendations[2] },
    generated_at: now,
    updated_at: now,
  }).eq("id", report.id);
  if (updateReportError) return NextResponse.json({ error: updateReportError.message }, { status: 500 });

  const attemptUpdate: Record<string, unknown> = { status: "completed", total_score: totalScore, max_score: maxScore, percentage_score: percentageScore, result_band: resultBand, report_id: report.id };
  if (Object.prototype.hasOwnProperty.call(attempt, "score")) attemptUpdate.score = totalScore;
  await admin.data.from("test_attempts").update(attemptUpdate).eq("id", attempt.id);

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    totalScore,
    maxScore,
    percentageScore,
    redirectTo: `/dashboard/psychometric/reports/${report.id}`,
  });
}
