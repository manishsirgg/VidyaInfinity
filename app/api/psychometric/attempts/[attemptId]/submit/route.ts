import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { computePsychometricReportData, PsychometricScoringError } from "@/lib/psychometric/scoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isPaid(paymentStatus: string | null | undefined, paidAt?: string | null, finalAmount?: number | null) {
  const p = (paymentStatus ?? "").toLowerCase();
  return ["paid", "success", "captured", "confirmed"].includes(p) || ((finalAmount ?? 0) <= 0 && p === "paid") || Boolean(paidAt);
}

export async function POST(_: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;
  const { attemptId } = await params;
  const profileId = auth.profile.id;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt, error: attemptError } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,order_id,status,score,submitted_at,completed_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError || !attempt || attempt.user_id !== profileId) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const { data: existingReport } = await admin.data
    .from("psychometric_reports")
    .select("id")
    .eq("attempt_id", attempt.id)
    .maybeSingle();

  if (attempt.status === "completed" && existingReport?.id) {
    return NextResponse.json({ ok: true, reportId: existingReport.id, redirectTo: `/dashboard/psychometric/reports/${existingReport.id}` });
  }
  if (["completed", "cancelled", "expired"].includes(String(attempt.status))) return NextResponse.json({ error: "Attempt cannot be submitted" }, { status: 409 });

  let order: { id: string; user_id: string; payment_status: string | null; paid_at: string | null; final_amount: number | null } | null = null;
  if (attempt.order_id) {
    const { data } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,payment_status,paid_at,final_amount")
      .eq("id", attempt.order_id)
      .maybeSingle();
    order = data;
  }
  if (!order) {
    const { data } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,payment_status,paid_at,final_amount")
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    order = data;
  }
  if (!order || order.user_id !== profileId || !isPaid(order.payment_status, order.paid_at, order.final_amount)) return NextResponse.json({ error: "Payment not confirmed" }, { status: 403 });

  const { data: test } = await admin.data.from("psychometric_tests").select("id,title,is_active,scoring_config,category,description").eq("id", attempt.test_id).single();
  if (!test?.is_active) return NextResponse.json({ error: "Test unavailable" }, { status: 409 });

  const { data: questions } = await admin.data.from("psychometric_questions").select("id,question_text,question_type,is_required,weight,min_scale_value,max_scale_value,metadata,scoring_config").eq("test_id", test.id).eq("is_active", true).order("sort_order");
  const qIds = (questions ?? []).map((q) => q.id);
  const { data: options } = await admin.data.from("psychometric_question_options").select("id,question_id,option_text,score_value,metadata").in("question_id", qIds).eq("is_active", true).order("sort_order");
  const { data: answers } = await admin.data.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text,awarded_score").eq("attempt_id", attempt.id).eq("user_id", attempt.user_id).eq("test_id", attempt.test_id);
  if (!answers || answers.length === 0) {
    const { count: anyAnswersCount } = await admin.data.from("psychometric_answers").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id);
    if ((anyAnswersCount ?? 0) > 0) {
      console.error("[psychometric-submit] answer loading mismatch", { attemptId: attempt.id, profileId, attemptUserId: attempt.user_id, testId: attempt.test_id, anyAnswersCount });
      return NextResponse.json({ error: "Saved answers were detected, but could not be loaded for report generation. Please retry once or contact support." }, { status: 409 });
    }
    return NextResponse.json({ error: "No answers saved yet. Please answer the required questions before submitting." }, { status: 400 });
  }

  let scoring;
  try {
    scoring = computePsychometricReportData({
    test: test as { title: string | null; scoring_config: Record<string, unknown> | null },
    questions: (questions ?? []) as Array<{ id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null; scoring_config: Record<string, unknown> | null }>,
    options: (options ?? []) as Array<{ id: string; question_id: string; option_text?: string | null; score_value: number | null; metadata: Record<string, unknown> | null }>,
    answers: (answers ?? []) as Array<{ id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null; awarded_score: number | string | null }>,
    enforceRequired: true,
    });
  } catch (error) {
    if (error instanceof PsychometricScoringError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  console.info("[psychometric-submit] scoring summary", { attemptId: attempt.id, answersLoaded: answers.length, totalScore: scoring.total, maxScore: scoring.max, percentage: scoring.percentage, snapshotLength: scoring.snapshot.length });

  for (const [answerId, awarded] of Object.entries(scoring.awardedScoresByAnswerId)) {
    await admin.data.from("psychometric_answers").update({ awarded_score: awarded }).eq("id", answerId);
  }

  const reportUpsert = {
    attempt_id: attempt.id, test_id: attempt.test_id, user_id: profileId, order_id: attempt.order_id,
    total_score: scoring.total, max_score: scoring.max, percentage_score: scoring.percentage, result_band: scoring.resultBand,
    summary: scoring.content.summary, strengths: scoring.content.strengths, improvement_areas: scoring.content.improvementAreas, recommendations: scoring.content.recommendations,
    dimension_scores: scoring.dimension, answers_snapshot: scoring.snapshot, report_html: `<h1>Vidya Infinity Psychometric Report</h1><p>${scoring.content.summary}</p>`,
    report_json: { disclaimer: scoring.content.recommendations[2], percentage: scoring.percentage, resultBand: scoring.resultBand }, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data: report, error: reportError } = await admin.data.from("psychometric_reports").upsert(reportUpsert, { onConflict: "attempt_id" }).select("id").single();
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
  const attemptUpdate: Record<string, unknown> = { status: "completed", submitted_at: new Date().toISOString(), completed_at: new Date().toISOString(), total_score: scoring.total, max_score: scoring.max, percentage_score: scoring.percentage, result_band: scoring.resultBand, report_id: report.id };
  if (Object.prototype.hasOwnProperty.call(attempt, "score")) attemptUpdate.score = scoring.total;
  const { error: updateError } = await admin.data.from("test_attempts").update(attemptUpdate).eq("id", attempt.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, reportId: report.id, redirectTo: `/dashboard/psychometric/reports/${report.id}` });
}
