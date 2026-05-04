import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;
  const { attemptId } = await params;
  const body = await request.json();

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,status,order_id,psychometric_orders(payment_status,final_paid_amount)")
    .eq("id", attemptId)
    .eq("user_id", auth.profile.id)
    .single();
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (!["not_started", "in_progress", "unlocked"].includes(String(attempt.status))) return NextResponse.json({ error: "Attempt is locked" }, { status: 400 });

  const order = Array.isArray(attempt.psychometric_orders) ? attempt.psychometric_orders[0] : attempt.psychometric_orders;
  const isFree = Number(order?.final_paid_amount ?? 0) === 0;
  if (!isFree && !isSuccessfulPaymentStatus(order?.payment_status)) return NextResponse.json({ error: "Payment pending" }, { status: 403 });

  const { questionId, optionId, selectedValues, answerText, numericValue } = body ?? {};
  if (!questionId) return NextResponse.json({ error: "questionId is required" }, { status: 400 });

  const { data: question } = await admin.data
    .from("psychometric_questions")
    .select("id,test_id,question_type,is_required,min_scale_value,max_scale_value,weight")
    .eq("id", questionId).eq("test_id", attempt.test_id).eq("is_active", true).single();
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  let awardedScore = 0;
  let safeOptionId: string | null = null;
  let safeSelectedValues: string[] | null = null;
  let safeAnswerText: string | null = null;
  let safeNumericValue: number | null = null;

  if (question.question_type === "single_choice") {
    if (!optionId) return NextResponse.json({ error: "optionId required" }, { status: 400 });
    const { data: option } = await admin.data.from("psychometric_question_options").select("id,score_value").eq("id", optionId).eq("question_id", question.id).eq("is_active", true).single();
    if (!option) return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    safeOptionId = option.id; awardedScore = Number(option.score_value ?? 0) * Number(question.weight ?? 1);
  } else if (question.question_type === "multiple_choice") {
    const values = Array.isArray(selectedValues) ? selectedValues : [];
    if (!values.length) return NextResponse.json({ error: "selectedValues required" }, { status: 400 });
    const { data: options } = await admin.data.from("psychometric_question_options").select("id,score_value").eq("question_id", question.id).in("id", values).eq("is_active", true);
    if (!options || options.length !== values.length) return NextResponse.json({ error: "Invalid selections" }, { status: 400 });
    safeSelectedValues = values; awardedScore = options.reduce((s, o) => s + Number(o.score_value ?? 0), 0) * Number(question.weight ?? 1);
  } else if (question.question_type === "scale" || question.question_type === "numeric") {
    if (numericValue === null || numericValue === undefined || Number.isNaN(Number(numericValue))) return NextResponse.json({ error: "numericValue required" }, { status: 400 });
    const value = Number(numericValue); safeNumericValue = value;
    if (question.question_type === "scale") {
      if (question.min_scale_value !== null && value < Number(question.min_scale_value)) return NextResponse.json({ error: "Below min range" }, { status: 400 });
      if (question.max_scale_value !== null && value > Number(question.max_scale_value)) return NextResponse.json({ error: "Above max range" }, { status: 400 });
      awardedScore = value * Number(question.weight ?? 1);
    }
  } else {
    if (!answerText && question.is_required) return NextResponse.json({ error: "answerText required" }, { status: 400 });
    safeAnswerText = answerText ?? null;
  }

  const payload = { attempt_id: attempt.id, test_id: attempt.test_id, user_id: auth.profile.id, question_id: question.id, option_id: safeOptionId, selected_values: safeSelectedValues, answer_text: safeAnswerText, numeric_value: safeNumericValue, awarded_score: awardedScore };
  const { data: saved, error } = await admin.data.from("psychometric_answers").upsert(payload, { onConflict: "attempt_id,question_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (attempt.status === "not_started" || attempt.status === "unlocked") {
    await admin.data.from("test_attempts").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", attempt.id);
  }

  return NextResponse.json({ success: true, answer: saved });
}
