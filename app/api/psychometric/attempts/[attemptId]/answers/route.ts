import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
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
    .select("id,user_id,test_id,status,order_id")
    .eq("id", attemptId)
    .single();
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (attempt.user_id !== auth.profile.id) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (!["not_started", "in_progress", "unlocked"].includes(String(attempt.status))) return NextResponse.json({ error: "Attempt is locked" }, { status: 400 });

  const paidStatuses = new Set(["paid", "captured", "success", "confirmed"]);
  let order: { id: string; user_id: string; payment_status: string | null } | null = null;
  if (attempt.order_id) {
    const { data } = await admin.data.from("psychometric_orders").select("id,user_id,payment_status").eq("id", attempt.order_id).maybeSingle();
    order = data;
  }
  if (!order) {
    const { data } = await admin.data.from("psychometric_orders").select("id,user_id,payment_status").eq("attempt_id", attempt.id).maybeSingle();
    order = data;
  }
  const paymentStatus = String(order?.payment_status ?? "").toLowerCase();
  const acceptedPaid = paidStatuses.has(paymentStatus);
  if (!order || order.user_id !== auth.profile.id) {
    return NextResponse.json({ error: "Paid psychometric order not found for this attempt." }, { status: 403 });
  }
  if (!acceptedPaid) {
    return NextResponse.json({ error: "Payment is not confirmed yet." }, { status: 403 });
  }

  const questionId = body?.questionId ?? body?.question_id;
  const optionId = body?.optionId ?? body?.option_id ?? null;
  const selectedValues = body?.selectedValues ?? body?.selected_values ?? null;
  const answerText = body?.answerText ?? body?.answer_text ?? null;
  const numericValue = body?.numericValue ?? body?.numeric_value ?? null;
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
    safeAnswerText = typeof answerText === "string" ? answerText : answerText === null ? null : String(answerText ?? "");
  }

  const payload = {
    attempt_id: attempt.id,
    test_id: attempt.test_id,
    user_id: auth.profile.id,
    question_id: question.id,
    option_id: safeOptionId,
    selected_values: safeSelectedValues,
    answer_text: safeAnswerText,
    numeric_value: safeNumericValue,
    awarded_score: awardedScore,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await admin.data.from("psychometric_answers").upsert(payload, { onConflict: "attempt_id,question_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (attempt.status === "not_started" || attempt.status === "unlocked") {
    const { error: attemptStatusUpdateError } = await admin.data.from("test_attempts").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", attempt.id);
    if (attemptStatusUpdateError) {
      console.error("[psychometric-autosave-status-update-failed]", { attemptId: attempt.id, error: attemptStatusUpdateError.message });
    }
  }

  return NextResponse.json({ success: true, answer: saved });
}
