import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { computePsychometricReportData, PsychometricScoringError } from "@/lib/psychometric/scoring";
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
    admin.data.from("psychometric_question_options").select("id,question_id,option_text,score_value,metadata").in("question_id", qIds).eq("is_active", true).order("sort_order"),
    admin.data.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text,awarded_score,test_id,user_id,attempt_id").eq("attempt_id", attempt.id).eq("user_id", attempt.user_id).eq("test_id", attempt.test_id),
  ]);

  if (!answers || answers.length === 0) {
    const { count: anyAnswersCount } = await admin.data.from("psychometric_answers").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id);
    if ((anyAnswersCount ?? 0) > 0) {
      console.error("[psychometric-regenerate] answer loading mismatch", { reportId, attemptId: attempt.id, userId: attempt.user_id, testId: attempt.test_id, anyAnswersCount });
      return NextResponse.json({ error: "Saved answers were detected, but could not be loaded for regeneration." }, { status: 409 });
    }
    return NextResponse.json({ error: "No saved answers found for this report attempt." }, { status: 400 });
  }

  let scoring;
  try {
    scoring = computePsychometricReportData({
      test: test as { id?: string | null; title: string | null; scoring_config: Record<string, unknown> | null },
      questions: (questions ?? []) as Array<{ id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null; scoring_config: Record<string, unknown> | null }>,
      options: (options ?? []) as Array<{ id: string; question_id: string; option_text?: string | null; score_value: number | null; metadata: Record<string, unknown> | null }>,
      answers: (answers ?? []) as Array<{ id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null; awarded_score: number | string | null }>,
      enforceRequired: true,
    });
  } catch (error) {
    if (error instanceof PsychometricScoringError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  console.log("[psychometric-regenerate-helper-output]", {
    reportId,
    attemptId: attempt.id,
    totalScore: scoring.totalScore,
    maxScore: scoring.maxScore,
    percentageScore: scoring.percentageScore,
    snapshotLength: scoring.answersSnapshot?.length ?? 0,
  });

  for (const [answerId, awarded] of Object.entries(scoring.awardedScoresByAnswerId)) {
    await admin.data.from("psychometric_answers").update({ awarded_score: awarded }).eq("id", answerId);
  }

  const totalScore = scoring.totalScore;
  const maxScore = scoring.maxScore;
  const percentageScore = scoring.percentageScore;
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentageScore, bands);
  const content = scoring.content;
  const answersSnapshot = scoring.answersSnapshot;
  if (answers.length > 0 && totalScore <= 0) {
    return NextResponse.json({ error: "Report total score could not be calculated." }, { status: 500 });
  }
  if (totalScore > 0 && maxScore <= 0) {
    return NextResponse.json({ error: "Report max score could not be calculated." }, { status: 500 });
  }
  if (answers.length > 0 && answersSnapshot.length === 0) {
    return NextResponse.json({ error: "Report answer snapshot could not be generated." }, { status: 500 });
  }

  console.log("[psychometric-report-regenerate-final]", {
    reportId,
    attemptId: attempt.id,
    testId: attempt.test_id,
    totalScore,
    maxScore,
    percentageScore,
    answersCount: answers.length,
    snapshotLength: answersSnapshot.length,
  });
  console.info("[psychometric-regenerate] scoring summary", { testId: attempt.test_id, attemptId: attempt.id, totalScore, finalMaxScore: maxScore, percentageScore, snapshotLength: answersSnapshot.length });

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
    snapshotLength: answersSnapshot.length,
    redirectTo: `/dashboard/psychometric/reports/${report.id}`,
  });
}
