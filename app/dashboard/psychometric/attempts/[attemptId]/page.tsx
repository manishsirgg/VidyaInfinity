import { redirect } from "next/navigation";

import { PsychometricAttemptRunner } from "@/components/student/psychometric-attempt-runner";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

type AttemptRow = { id: string; user_id: string; test_id: string; status: string; psychometric_orders: { payment_status: string | null; paid_at: string | null }[] | { payment_status: string | null; paid_at: string | null } | null; psychometric_reports: { id: string }[] | { id: string } | null };

type AnswerRow = { question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null };
const isPaid = (s: string | null, p: string | null) => ["paid", "success", "captured", "confirmed"].includes(String(s ?? "").toLowerCase()) || Boolean(p);

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params; const { profile } = await requireUser("student"); const supabase = await createClient();
  const { data: attempt } = await supabase.from("test_attempts").select("id,user_id,test_id,status,psychometric_orders(payment_status,paid_at),psychometric_reports(id)").eq("id", attemptId).maybeSingle<AttemptRow>();
  if (!attempt || attempt.user_id !== profile.id) redirect("/dashboard/psychometric");
  const order = Array.isArray(attempt.psychometric_orders) ? attempt.psychometric_orders[0] : attempt.psychometric_orders;
  if (!isPaid(order?.payment_status ?? null, order?.paid_at ?? null)) redirect("/dashboard/psychometric");
  const report = Array.isArray(attempt.psychometric_reports) ? attempt.psychometric_reports[0] : attempt.psychometric_reports;
  if (attempt.status === "completed" && report?.id) redirect(`/dashboard/psychometric/reports/${report.id}`);
  if (["completed", "cancelled", "expired"].includes(String(attempt.status))) redirect("/dashboard/psychometric");
  const { data: questions } = await supabase.from("psychometric_questions").select("id,question_text,question_type,is_required,min_scale_value,max_scale_value,psychometric_question_options(id,option_label,is_active)").eq("test_id", attempt.test_id).eq("is_active", true).order("sort_order");
  const { data: answers } = await supabase.from("psychometric_answers").select("question_id,option_id,selected_values,numeric_value,answer_text").eq("attempt_id", attempt.id).returns<AnswerRow[]>();
  const initial: Record<string, unknown> = {};
  (answers ?? []).forEach((a) => { initial[a.question_id] = a.option_id ?? a.selected_values ?? a.numeric_value ?? a.answer_text ?? ""; });
  const normalizedQuestions = (questions ?? []).map((q) => ({ ...q, psychometric_question_options: (q.psychometric_question_options ?? []).filter((o: { is_active: boolean }) => o.is_active) }));
  return <div className="mx-auto max-w-4xl px-4 py-8"><h1 className="mb-4 text-2xl font-semibold">Psychometric Attempt</h1><PsychometricAttemptRunner attemptId={attempt.id} questions={normalizedQuestions} initial={initial} /></div>;
}
