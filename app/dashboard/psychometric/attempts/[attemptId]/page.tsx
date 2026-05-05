import { redirect } from "next/navigation";

import { PsychometricAttemptRunner } from "@/components/student/psychometric-attempt-runner";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AttemptRow = { id: string; user_id: string; test_id: string; status: string; order_id: string | null };

type AnswerRow = { question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null };
type QuestionRow = { id: string; question_text: string; question_type: string; is_required: boolean; min_scale_value: number | null; max_scale_value: number | null };
type OptionRow = { id: string; question_id: string; option_text: string; option_value: string | null; score_value: number | null; sort_order: number | null; is_active: boolean; metadata: Record<string, unknown> | null };
const isPaid = (s: string | null, p: string | null) => ["paid", "success", "captured", "confirmed"].includes(String(s ?? "").toLowerCase()) || Boolean(p);

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params; const { profile, user } = await requireUser("student"); const supabase = await createClient();
  if (!profile?.id) redirect("/dashboard/psychometric");
  if (String(profile.role ?? "").toLowerCase() !== "student") redirect("/dashboard/psychometric");
  const { data: profileByUserId } = await supabase.from("profiles").select("id,role").eq("user_id", user.id).maybeSingle<{ id: string; role: string | null }>();
  const { data: profileById } = profileByUserId ? { data: null } : await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle<{ id: string; role: string | null }>();
  const resolvedProfile = profileByUserId ?? profileById ?? { id: profile.id, role: profile.role };
  const { data: attempt } = await supabase.from("test_attempts").select("id,user_id,test_id,status,order_id").eq("id", attemptId).maybeSingle<AttemptRow>();
  if (!attempt || attempt.user_id !== resolvedProfile.id) redirect("/dashboard/psychometric");
  const { data: orderByOrderId } = attempt.order_id
    ? await supabase.from("psychometric_orders").select("id,payment_status,paid_at,user_id,attempt_id").eq("id", attempt.order_id).eq("user_id", resolvedProfile.id).maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; user_id: string; attempt_id: string | null }>()
    : { data: null };
  const { data: orderByAttemptId } = orderByOrderId
    ? { data: null }
    : await supabase.from("psychometric_orders").select("id,payment_status,paid_at,user_id,attempt_id").eq("attempt_id", attempt.id).eq("user_id", resolvedProfile.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; user_id: string; attempt_id: string | null }>();
  const order = orderByOrderId ?? orderByAttemptId;
  if (!order || !isPaid(order?.payment_status ?? null, order?.paid_at ?? null)) redirect("/dashboard/psychometric");
  const { data: report } = await supabase.from("psychometric_reports").select("id").eq("attempt_id", attempt.id).maybeSingle<{ id: string }>();
  if (attempt.status === "completed" && report?.id) redirect(`/dashboard/psychometric/reports/${report.id}`);
  if (["completed", "cancelled", "expired"].includes(String(attempt.status).toLowerCase())) redirect("/dashboard/psychometric");

  const { data: test } = await supabase.from("psychometric_tests").select("id,title").eq("id", attempt.test_id).maybeSingle<{ id: string; title: string | null }>();
  if (!test) return <div className="mx-auto max-w-4xl px-4 py-8 text-rose-600">Unable to load test details for this attempt.</div>;

  const { data: questions, error: questionError } = await supabase
    .from("psychometric_questions")
    .select("id,question_text,question_type,is_required,min_scale_value,max_scale_value")
    .eq("test_id", attempt.test_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<QuestionRow[]>();

  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: options, error: optionError } = questionIds.length
    ? await supabase
        .from("psychometric_question_options")
        .select("id,question_id,option_text,option_value,score_value,sort_order,is_active,metadata")
        .in("question_id", questionIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .returns<OptionRow[]>()
    : { data: [] as OptionRow[], error: null };

  if (!questions?.length) return <div className="mx-auto max-w-4xl px-4 py-8 text-rose-600">No active questions are available for this test right now.</div>;

  if (questionError || optionError) {
    console.error("[psychometric-attempt-page] query failure", { attemptId, questionError, optionError });
  }

  const optionsByQuestionId = (options ?? []).reduce<Record<string, OptionRow[]>>((acc, option) => {
    if (!acc[option.question_id]) acc[option.question_id] = [];
    acc[option.question_id].push(option);
    return acc;
  }, {});

  const questionsWithOptions = (questions ?? []).map((question) => ({
    ...question,
    options: optionsByQuestionId[question.id] ?? [],
  }));

  const { data: answers } = await supabase.from("psychometric_answers").select("question_id,option_id,selected_values,numeric_value,answer_text").eq("attempt_id", attempt.id).returns<AnswerRow[]>();
  const initial: Record<string, unknown> = {};
  (answers ?? []).forEach((a) => { initial[a.question_id] = a.option_id ?? a.selected_values ?? a.numeric_value ?? a.answer_text ?? ""; });

  return (
    <PsychometricAttemptRunner
      attemptId={attempt.id}
      attemptStatus={attempt.status}
      testTitle={test.title ?? "Psychometric Attempt"}
      questions={questionsWithOptions}
      initial={initial}
    />
  );
}
