import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildReportContent, pickResultBand } from "@/lib/psychometric/reporting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isPaid(paymentStatus: string | null | undefined, paidAt?: string | null, finalAmount?: number | null) {
  const p = (paymentStatus ?? "").toLowerCase();
  return ["paid", "success", "captured", "confirmed"].includes(p) || ((finalAmount ?? 0) <= 0 && p === "paid") || Boolean(paidAt);
}

export async function POST(_: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;
  const { attemptId } = await params;
  const authUserId = auth.user.id;
  const profileId = auth.profile.id;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt, error: attemptError } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,order_id,status,score,submitted_at,completed_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError || !attempt || attempt.user_id !== profileId) {
    return NextResponse.json({
      error: "Attempt not found",
      debug: {
        attemptId,
        authUserId,
        profileId,
        foundAttemptId: attempt?.id ?? null,
        foundAttemptUserId: attempt?.user_id ?? null,
        reason: attemptError ? `attempt_lookup_error:${attemptError.message}` : !attempt ? "attempt_missing" : "ownership_mismatch",
      },
    }, { status: 404 });
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
  const { data: options } = await admin.data.from("psychometric_question_options").select("id,question_id,score_value,metadata").in("question_id", qIds).eq("is_active", true).order("sort_order");
  const { data: answers } = await admin.data.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text").eq("attempt_id", attempt.id).eq("user_id", profileId);
  if (!answers || answers.length === 0) return NextResponse.json({ error: "No answers saved yet. Please answer the required questions before submitting." }, { status: 400 });

  type OptionRow = { id: string; question_id: string; score_value: number | null; metadata: Record<string, unknown> | null };
  type AnswerRow = { id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null };
  type QuestionRow = { id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null };
  const optsByQ = new Map<string, OptionRow[]>(); (options as OptionRow[] ?? []).forEach((o) => optsByQ.set(o.question_id, [...(optsByQ.get(o.question_id) ?? []), o]));
  const ansByQ = new Map((answers as AnswerRow[] ?? []).map((a) => [a.question_id, a]));

  let total = 0; let max = 0; const dimension: Record<string, { score: number; maxScore: number; percentage: number }> = {}; const snapshot: Array<Record<string, unknown>> = [];
  let requiredQuestionsCount = 0;
  let missingRequiredCount = 0;
  for (const q of (questions as QuestionRow[] ?? [])) {
    const a = ansByQ.get(q.id); const qOpts = optsByQ.get(q.id) ?? []; const weight = Number(q.weight ?? 1);
    if (q.is_required) requiredQuestionsCount += 1;
    if (q.is_required && !a) {
      missingRequiredCount += 1;
      return NextResponse.json({ error: `Required question unanswered: ${q.question_text}` }, { status: 400 });
    }
    let awarded = 0; let qMax = 0;
    if (q.question_type === "single_choice") { qMax = Math.max(0, ...qOpts.map((o) => Number(o.score_value ?? 0))) * weight; if (q.is_required && !a?.option_id) return NextResponse.json({ error: "Single choice answer required" }, { status: 400 }); if (a?.option_id) { const op = qOpts.find((o) => o.id === a.option_id); if (!op && q.is_required) return NextResponse.json({ error: "Invalid single choice answer" }, { status: 400 }); awarded = Number(op?.score_value ?? 0) * weight; } }
    if (q.question_type === "multiple_choice") { qMax = qOpts.reduce((s, o) => s + Math.max(0, Number(o.score_value ?? 0)), 0) * weight; const vals = Array.isArray(a?.selected_values) ? a.selected_values : []; if (q.is_required && vals.length === 0) return NextResponse.json({ error: "At least one option must be selected" }, { status: 400 }); const selected = qOpts.filter((o) => vals.includes(o.id)); if (q.is_required && selected.length !== vals.length) return NextResponse.json({ error: "Invalid multi choice answer" }, { status: 400 }); awarded = selected.reduce((s, o) => s + Number(o.score_value ?? 0), 0) * weight; }
    if (q.question_type === "scale") { qMax = Number(q.max_scale_value ?? 0) * weight; const n = Number(a?.numeric_value); if (q.is_required && !Number.isFinite(n)) return NextResponse.json({ error: "Missing scale value" }, { status: 400 }); if (Number.isFinite(n)) { if (n < Number(q.min_scale_value ?? 0) || n > Number(q.max_scale_value ?? 0)) return NextResponse.json({ error: "Scale value out of range" }, { status: 400 }); awarded = n * weight; } }
    if (q.question_type === "numeric") { if (q.is_required && !Number.isFinite(Number(a?.numeric_value))) return NextResponse.json({ error: "Numeric answer required" }, { status: 400 }); }
    if (q.question_type === "text") { if (q.is_required && !String(a?.answer_text ?? "").trim()) return NextResponse.json({ error: "Text answer required" }, { status: 400 }); }
    total += awarded; max += qMax;
    if (a?.id) await admin.data.from("psychometric_answers").update({ awarded_score: awarded }).eq("id", a.id);
    const dim = String((q.metadata as Record<string, unknown> | null)?.dimension ?? "General");
    if (!dimension[dim]) dimension[dim] = { score: 0, maxScore: 0, percentage: 0 };
    dimension[dim].score += awarded; dimension[dim].maxScore += qMax;
    snapshot.push({ questionId: q.id, question: q.question_text, type: q.question_type, awardedScore: awarded });
  }
  console.log("[psychometric-submit-debug]", { attemptId, authUserId, profileId, attemptFound: Boolean(attempt), attemptUserId: attempt?.user_id ?? null, orderFound: Boolean(order), orderStatus: order?.payment_status ?? null, answersCount: answers.length, requiredQuestionsCount, missingRequiredCount });
  Object.values(dimension).forEach((d) => { d.percentage = d.maxScore > 0 ? Number(((d.score / d.maxScore) * 100).toFixed(2)) : 0; });
  const percentage = max > 0 ? Number(((total / max) * 100).toFixed(2)) : 0;
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentage, bands);
  const content = buildReportContent({ testTitle: test.title ?? "Psychometric Test", percentage, resultBand });

  const reportUpsert = {
    attempt_id: attempt.id, test_id: attempt.test_id, user_id: profileId, order_id: attempt.order_id,
    total_score: total, max_score: max, percentage_score: percentage, result_band: resultBand,
    summary: content.summary, strengths: content.strengths, improvement_areas: content.improvementAreas, recommendations: content.recommendations,
    dimension_scores: dimension, answers_snapshot: snapshot, report_html: `<h1>Vidya Infinity Psychometric Report</h1><p>${content.summary}</p>`,
    report_json: { disclaimer: content.recommendations[2], percentage, resultBand }, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data: report, error: reportError } = await admin.data.from("psychometric_reports").upsert(reportUpsert, { onConflict: "attempt_id" }).select("id").single();
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });

  const attemptUpdate: Record<string, unknown> = { status: "completed", submitted_at: new Date().toISOString(), completed_at: new Date().toISOString(), total_score: total, max_score: max, percentage_score: percentage, result_band: resultBand, report_id: report.id };
  if (Object.prototype.hasOwnProperty.call(attempt, "score")) attemptUpdate.score = total;
  const { error: updateError } = await admin.data.from("test_attempts").update(attemptUpdate).eq("id", attempt.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, reportId: report.id, redirectTo: `/dashboard/psychometric/reports/${report.id}` });
}
