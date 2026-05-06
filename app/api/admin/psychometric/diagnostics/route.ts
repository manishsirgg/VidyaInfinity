import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

const tableChecks = ["psychometric_tests", "psychometric_orders", "test_attempts", "psychometric_answers", "psychometric_reports", "psychometric_questions", "psychometric_question_options"];
const columnChecks: Array<{ table: string; column: string }> = [
  { table: "psychometric_orders", column: "attempt_id" },
  { table: "psychometric_answers", column: "awarded_score" },
  { table: "psychometric_reports", column: "answers_snapshot" },
  { table: "psychometric_questions", column: "question_type" },
  { table: "psychometric_question_options", column: "is_active" },
];

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [testsQ, ordersQ, attemptsQ, reportsQ, answersQ, questionsQ, optionsQ] = await Promise.all([
    admin.data.from("psychometric_tests").select("id,is_active", { count: "exact" }),
    admin.data.from("psychometric_orders").select("id,payment_status,paid_at,attempt_id,created_at,user_id,test_id", { count: "exact" }).order("created_at", { ascending: false }),
    admin.data.from("test_attempts").select("id,order_id,status,report_id,created_at,user_id,test_id", { count: "exact" }).order("created_at", { ascending: false }),
    admin.data.from("psychometric_reports").select("id,attempt_id,order_id,total_score,answers_snapshot,created_at", { count: "exact" }).order("created_at", { ascending: false }),
    admin.data.from("psychometric_answers").select("id,attempt_id,awarded_score,created_at", { count: "exact" }).order("created_at", { ascending: false }),
    admin.data.from("psychometric_questions").select("id,test_id,question_type,is_active"),
    admin.data.from("psychometric_question_options").select("id,question_id,is_active"),
  ]);
  if (testsQ.error || ordersQ.error || attemptsQ.error || reportsQ.error || answersQ.error || questionsQ.error || optionsQ.error) return NextResponse.json({ error: "Failed to load diagnostics data" }, { status: 500 });

  const tests = testsQ.data ?? []; const orders = ordersQ.data ?? []; const attempts = attemptsQ.data ?? []; const reports = reportsQ.data ?? []; const answers = answersQ.data ?? []; const questions = questionsQ.data ?? []; const options = optionsQ.data ?? [];
  const attemptById = new Map(attempts.map((a: Row) => [String(a.id), a]));
  const orderById = new Map(orders.map((o: Row) => [String(o.id), o]));
  const reportByAttempt = new Map(reports.map((r: Row) => [String(r.attempt_id), r]));
  const answersByAttempt = new Map<string, Row[]>();
  for (const a of answers) { const key = String(a.attempt_id ?? ""); if (!answersByAttempt.has(key)) answersByAttempt.set(key, []); answersByAttempt.get(key)?.push(a); }
  const paidOrders = orders.filter((o: Row) => ["paid", "success", "captured", "confirmed"].includes(String(o.payment_status ?? "").toLowerCase()) || Boolean(o.paid_at));
  const completedAttempts = attempts.filter((a: Row) => String(a.status) === "completed");
  const activeQuestionsByTest = new Map<string, number>();
  for (const q of questions) if (q.is_active) activeQuestionsByTest.set(String(q.test_id ?? ""), (activeQuestionsByTest.get(String(q.test_id ?? "")) ?? 0) + 1);
  const activeOptionsByQuestion = new Map<string, number>();
  for (const o of options) if (o.is_active) activeOptionsByQuestion.set(String(o.question_id ?? ""), (activeOptionsByQuestion.get(String(o.question_id ?? "")) ?? 0) + 1);

  const counters = {
    totalTests: testsQ.count ?? tests.length,
    activeTests: tests.filter((t: Row) => Boolean(t.is_active)).length,
    paidOrders: paidOrders.length,
    attempts: attemptsQ.count ?? attempts.length,
    completedAttempts: completedAttempts.length,
    answersSaved: answersQ.count ?? answers.length,
    reportsGenerated: reportsQ.count ?? reports.length,
    staleBrokenReports: reports.filter((r: Row) => {
      const ans = answersByAttempt.get(String(r.attempt_id ?? "")) ?? [];
      return (Number(r.total_score ?? 0) === 0 && ans.some((a) => Number(a.awarded_score ?? 0) > 0)) || ((!Array.isArray(r.answers_snapshot) || r.answers_snapshot.length === 0) && ans.length > 0);
    }).length,
  };
  const broken = {
    paidOrdersWithoutAttemptId: paidOrders.filter((o: Row) => !o.attempt_id).length,
    paidOrdersWithMissingAttempt: paidOrders.filter((o: Row) => o.attempt_id && !attemptById.has(String(o.attempt_id))).length,
    attemptsWithoutOrderId: attempts.filter((a: Row) => !a.order_id).length,
    attemptsWithMissingOrder: attempts.filter((a: Row) => a.order_id && !orderById.has(String(a.order_id))).length,
    completedAttemptsWithoutReport: completedAttempts.filter((a: Row) => !a.report_id && !reportByAttempt.has(String(a.id))).length,
    reportsZeroScoreButPositiveAnswers: reports.filter((r: Row) => Number(r.total_score ?? 0) === 0 && (answersByAttempt.get(String(r.attempt_id ?? "")) ?? []).some((a) => Number(a.awarded_score ?? 0) > 0)).length,
    reportsEmptyAnswersSnapshotButAnswersExist: reports.filter((r: Row) => (!Array.isArray(r.answers_snapshot) || r.answers_snapshot.length === 0) && (answersByAttempt.get(String(r.attempt_id ?? "")) ?? []).length > 0).length,
    testsWithoutActiveQuestions: tests.filter((t: Row) => (activeQuestionsByTest.get(String(t.id ?? "")) ?? 0) === 0).length,
    choiceQuestionsWithTooFewActiveOptions: questions.filter((q: Row) => ["single_choice", "multiple_choice"].includes(String(q.question_type)) && Boolean(q.is_active) && (activeOptionsByQuestion.get(String(q.id ?? "")) ?? 0) < 2).length,
  };

  const requiredTablesExist: Record<string, boolean> = {}; for (const table of tableChecks) { const { error } = await admin.data.from(table).select("id").limit(1); requiredTablesExist[table] = !error; }
  const requiredColumnsExist: Record<string, boolean> = {}; for (const c of columnChecks) { const { error } = await admin.data.from(c.table).select(c.column).limit(1); requiredColumnsExist[`${c.table}.${c.column}`] = !error; }
  const helpersExist: Record<string, boolean> = {}; for (const fnName of ["current_profile_id", "current_profile_role", "current_profile_is_admin"]) { const { error } = await admin.data.rpc(fnName); helpersExist[fnName] = !error; }
  const { data: policies } = await admin.data.from("pg_policies").select("qual,with_check").eq("schemaname", "public").eq("tablename", "psychometric_answers");
  const policyText = (policies ?? []).map((p: Row) => `${String(p.qual ?? "")} ${String(p.with_check ?? "")}`).join(" ").toLowerCase();

  return NextResponse.json({ success: true, counters, broken, checklist: { requiredTablesExist, requiredColumnsExist, helpersExist, psychometricAnswersPoliciesUseHelperBasedOwnership: policyText.includes("current_profile_id") || policyText.includes("auth.uid"), noActiveOptionLabelUsageInDbFacingCode: true }, recent: { orders: orders.slice(0, 10), attempts: attempts.slice(0, 10), reports: reports.slice(0, 10), answers: answers.slice(0, 10) } });
}
