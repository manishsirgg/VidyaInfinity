import { redirect } from "next/navigation";

import { PsychometricAttemptRunner } from "@/components/student/psychometric-attempt-runner";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AttemptRow = { id: string; user_id: string; test_id: string; status: string; order_id: string | null };

type AnswerRow = { question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null };
const isPaid = (s: string | null, p: string | null) => ["paid", "success", "captured", "confirmed"].includes(String(s ?? "").toLowerCase()) || Boolean(p);

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params; const { profile, user } = await requireUser("student"); const supabase = await createClient();
  if (!profile?.id) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, attemptId, redirectReason: "profile_missing" });
    redirect("/dashboard/psychometric");
  }
  if (String(profile.role ?? "").toLowerCase() !== "student") {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: profile.id, attemptId, redirectReason: "not_student" });
    redirect("/dashboard/psychometric");
  }
  const { data: profileByUserId } = await supabase.from("profiles").select("id,role").eq("user_id", user.id).maybeSingle<{ id: string; role: string | null }>();
  const { data: profileById } = profileByUserId ? { data: null } : await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle<{ id: string; role: string | null }>();
  const resolvedProfile = profileByUserId ?? profileById ?? { id: profile.id, role: profile.role };
  const { data: attempt } = await supabase.from("test_attempts").select("id,user_id,test_id,status,order_id").eq("id", attemptId).maybeSingle<AttemptRow>();
  if (!attempt) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, attemptUserId: null, attemptStatus: null, orderId: null, redirectReason: "attempt_not_found" });
    redirect("/dashboard/psychometric");
  }
  if (attempt.user_id !== resolvedProfile.id) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, attemptUserId: attempt.user_id, attemptStatus: attempt.status, orderId: attempt.order_id, redirectReason: "ownership_mismatch" });
    redirect("/dashboard/psychometric");
  }
  const { data: orderByOrderId } = attempt.order_id
    ? await supabase.from("psychometric_orders").select("id,payment_status,paid_at,user_id,attempt_id").eq("id", attempt.order_id).eq("user_id", resolvedProfile.id).maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; user_id: string; attempt_id: string | null }>()
    : { data: null };
  const { data: orderByAttemptId } = orderByOrderId
    ? { data: null }
    : await supabase.from("psychometric_orders").select("id,payment_status,paid_at,user_id,attempt_id").eq("attempt_id", attempt.id).eq("user_id", resolvedProfile.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; user_id: string; attempt_id: string | null }>();
  const order = orderByOrderId ?? orderByAttemptId;
  if (!order) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, attemptUserId: attempt.user_id, attemptStatus: attempt.status, orderId: attempt.order_id, redirectReason: "order_not_found" });
    redirect("/dashboard/psychometric");
  }
  if (!isPaid(order?.payment_status ?? null, order?.paid_at ?? null)) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, attemptUserId: attempt.user_id, attemptStatus: attempt.status, orderId: attempt.order_id, redirectReason: "order_not_paid" });
    redirect("/dashboard/psychometric");
  }
  const { data: report } = await supabase.from("psychometric_reports").select("id").eq("attempt_id", attempt.id).maybeSingle<{ id: string }>();
  if (attempt.status === "completed" && report?.id) redirect(`/dashboard/psychometric/reports/${report.id}`);
  if (String(attempt.status).toLowerCase() === "completed") {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, redirectReason: "terminal_status_completed" });
    redirect("/dashboard/psychometric");
  }
  if (String(attempt.status).toLowerCase() === "cancelled") {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, redirectReason: "terminal_status_cancelled" });
    redirect("/dashboard/psychometric");
  }
  if (String(attempt.status).toLowerCase() === "expired") {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, redirectReason: "terminal_status_expired" });
    redirect("/dashboard/psychometric");
  }
  const { data: test } = await supabase.from("psychometric_tests").select("id").eq("id", attempt.test_id).maybeSingle<{ id: string }>();
  if (!test) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, redirectReason: "test_missing" });
    return <div className="mx-auto max-w-4xl px-4 py-8 text-rose-600">Unable to load test details for this attempt.</div>;
  }
  const { data: questions } = await supabase.from("psychometric_questions").select("id,question_text,question_type,is_required,min_scale_value,max_scale_value,psychometric_question_options(id,option_label,is_active,sort_order)").eq("test_id", attempt.test_id).eq("is_active", true).order("sort_order");
  if (!questions?.length) {
    console.log("[psychometric-attempt-page]", { authUserId: user.id, profileId: resolvedProfile.id, attemptId, redirectReason: "questions_missing" });
    return <div className="mx-auto max-w-4xl px-4 py-8 text-rose-600">No active questions are available for this test right now.</div>;
  }
  const { data: answers } = await supabase.from("psychometric_answers").select("question_id,option_id,selected_values,numeric_value,answer_text").eq("attempt_id", attempt.id).returns<AnswerRow[]>();
  const initial: Record<string, unknown> = {};
  (answers ?? []).forEach((a) => { initial[a.question_id] = a.option_id ?? a.selected_values ?? a.numeric_value ?? a.answer_text ?? ""; });
  const normalizedQuestions = (questions ?? []).map((q) => ({ ...q, psychometric_question_options: (q.psychometric_question_options ?? []).filter((o: { is_active: boolean }) => o.is_active).sort((a: { sort_order?: number | null }, b: { sort_order?: number | null }) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) }));
  return <div className="mx-auto max-w-4xl px-4 py-8"><h1 className="mb-4 text-2xl font-semibold">Psychometric Attempt</h1><PsychometricAttemptRunner attemptId={attempt.id} questions={normalizedQuestions} initial={initial} /></div>;
}
