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

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,order_id,status,score,psychometric_orders(id,payment_status,paid_at,final_amount),psychometric_reports(id)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (attempt.user_id !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existingReport = Array.isArray(attempt.psychometric_reports) ? attempt.psychometric_reports[0] : attempt.psychometric_reports;
  if (attempt.status === "completed" && existingReport?.id) {
    return NextResponse.json({ success: true, reportId: existingReport.id, redirectTo: `/dashboard/psychometric/reports/${existingReport.id}` });
  }
  if (["completed", "cancelled", "expired"].includes(String(attempt.status))) return NextResponse.json({ error: "Attempt cannot be submitted" }, { status: 409 });

  const order = Array.isArray(attempt.psychometric_orders) ? attempt.psychometric_orders[0] : attempt.psychometric_orders;
  if (!order || !isPaid(order.payment_status, order.paid_at, order.final_amount)) return NextResponse.json({ error: "Payment not confirmed" }, { status: 403 });

  const { data: test } = await admin.data.from("psychometric_tests").select("id,title,is_active,scoring_config,category,description").eq("id", attempt.test_id).single();
  if (!test?.is_active) return NextResponse.json({ error: "Test unavailable" }, { status: 409 });

  const { data: questions } = await admin.data.from("psychometric_questions").select("id,question_text,question_type,is_required,weight,min_scale_value,max_scale_value,metadata,scoring_config").eq("test_id", test.id).eq("is_active", true).order("sort_order");
  const qIds = (questions ?? []).map((q) => q.id);
  const { data: options } = await admin.data.from("psychometric_question_options").select("id,question_id,score_value,metadata").in("question_id", qIds).eq("is_active", true).order("sort_order");
  const { data: answers } = await admin.data.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text").eq("attempt_id", attempt.id);

  type OptionRow = { id: string; question_id: string; score_value: number | null; metadata: Record<string, unknown> | null };
  type AnswerRow = { id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null };
  type QuestionRow = { id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null };
  const optsByQ = new Map<string, OptionRow[]>(); (options as OptionRow[] ?? []).forEach((o) => optsByQ.set(o.question_id, [...(optsByQ.get(o.question_id) ?? []), o]));
  const ansByQ = new Map((answers as AnswerRow[] ?? []).map((a) => [a.question_id, a]));

  let total = 0; let max = 0; const dimension: Record<string, { score: number; maxScore: number; percentage: number }> = {}; const snapshot: Array<Record<string, unknown>> = [];
  for (const q of (questions as QuestionRow[] ?? [])) {
    const a = ansByQ.get(q.id); const qOpts = optsByQ.get(q.id) ?? []; const weight = Number(q.weight ?? 1);
    if (q.is_required && !a) return NextResponse.json({ error: `Required question unanswered: ${q.question_text}` }, { status: 400 });
    let awarded = 0; let qMax = 0;
    if (q.question_type === "single_choice") { qMax = Math.max(0, ...qOpts.map((o) => Number(o.score_value ?? 0))) * weight; if (a?.option_id) { const op = qOpts.find((o) => o.id === a.option_id); if (!op && q.is_required) return NextResponse.json({ error: "Invalid single choice answer" }, { status: 400 }); awarded = Number(op?.score_value ?? 0) * weight; } }
    if (q.question_type === "multiple_choice") { qMax = qOpts.reduce((s, o) => s + Math.max(0, Number(o.score_value ?? 0)), 0) * weight; const vals = Array.isArray(a?.selected_values) ? a.selected_values : []; const selected = qOpts.filter((o) => vals.includes(o.id)); if (q.is_required && vals.length && selected.length !== vals.length) return NextResponse.json({ error: "Invalid multi choice answer" }, { status: 400 }); awarded = selected.reduce((s, o) => s + Number(o.score_value ?? 0), 0) * weight; }
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
  Object.values(dimension).forEach((d) => { d.percentage = d.maxScore > 0 ? Number(((d.score / d.maxScore) * 100).toFixed(2)) : 0; });
  const percentage = max > 0 ? Number(((total / max) * 100).toFixed(2)) : 0;
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentage, bands);
  const content = buildReportContent({ testTitle: test.title ?? "Psychometric Test", percentage, resultBand });

  const reportUpsert = {
    attempt_id: attempt.id, test_id: attempt.test_id, user_id: auth.user.id, order_id: attempt.order_id,
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

  return NextResponse.json({ success: true, reportId: report.id, redirectTo: `/dashboard/psychometric/reports/${report.id}` });
}
