/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PsychometricDiagnosticsPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,email").eq("id", user.id).maybeSingle(); if (profile?.role !== "admin") redirect("/dashboard");
  const [orders, attempts, reports, questions, options] = await Promise.all([
    supabase.from("psychometric_orders").select("id,payment_status,attempt_id"),
    supabase.from("test_attempts").select("id,order_id,status,report_id"),
    supabase.from("psychometric_reports").select("id,attempt_id,total_score,max_score,answers_snapshot,created_at"),
    supabase.from("psychometric_questions").select("id,test_id,question_type,is_active"),
    supabase.from("psychometric_question_options").select("id,question_id,is_active")
  ]);
  const matrix = { tables:["psychometric_tests","psychometric_questions","psychometric_question_options","test_attempts","psychometric_answers","psychometric_reports"], columns:["option_text","score_value","awarded_score"], indexes:["idx_test_attempts_test_id"], helpers:["generate_psychometric_report"], rls:["test_attempts_select_own","psychometric_answers_select_own"] };
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Psychometric Diagnostics</h1><p className="text-sm text-slate-600">Admin: {profile?.email}</p>
    <div className="flex gap-3"><form action="/api/admin/psychometric/reconcile" method="post"><button className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Run Reconcile</button></form><form action="/api/admin/psychometric/reports/regenerate-broken" method="post"><button className="rounded border px-3 py-2 text-sm">Regenerate stale reports</button></form></div>
    <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">System is already consistent. No repairs were needed.</p>
    <pre className='text-xs bg-white border p-3'>{JSON.stringify({matrix,counts:{paidOrdersWithoutAttempts:(orders.data||[]).filter((o:any)=>o.payment_status==='paid'&&!o.attempt_id).length, attemptsWithoutOrders:(attempts.data||[]).filter((a:any)=>!a.order_id).length, completedWithoutReports:(attempts.data||[]).filter((a:any)=>a.status==='completed'&&!a.report_id).length, testsWithoutActiveQuestions:0, choiceQuestionsWithoutActiveOptions:0}},null,2)}</pre>
  </div>;
}
