import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PsychometricAdminHeader, PsychometricAdminSubnav } from "@/app/admin/psychometric/_components/AdminPsychometricUI";

type AttemptRow = {
  id: string;
  user_id: string;
  test_id: string;
  order_id: string | null;
  report_id: string | null;
  status: string | null;
  created_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage_score: number | null;
  result_band: string | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  question_type: string;
  sort_order: number | null;
  is_active: boolean | null;
  max_scale_value: number | null;
  metadata: Record<string, unknown> | null;
  weight: number | null;
};

type OptionRow = {
  id: string;
  question_id: string;
  option_text: string;
  score_value: number | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type AnswerRow = {
  id: string;
  question_id: string;
  option_id: string | null;
  selected_values: string[] | null;
  numeric_value: number | null;
  answer_text: string | null;
  awarded_score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const statusTone = (status?: string | null) => {
  const s = (status ?? "unknown").toLowerCase();
  if (s.includes("completed") || s.includes("paid")) return "bg-emerald-100 text-emerald-800";
  if (s.includes("cancel") || s.includes("expire") || s.includes("fail")) return "bg-rose-100 text-rose-800";
  if (s.includes("progress") || s.includes("unlock")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
};

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

export default async function AttemptDetail({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string }>();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: attempt } = await supabase.from("test_attempts").select("*").eq("id", attemptId).maybeSingle<AttemptRow>();
  if (!attempt) return <div className="p-4 text-sm text-rose-700">Attempt not found.</div>;

  const [studentQ, testQ, orderQ, reportQ, questionsQ, optionsQ, answersQ] = await Promise.all([
    supabase.from("profiles").select("full_name,email").eq("id", attempt.user_id).maybeSingle<{ full_name: string | null; email?: string | null }>(),
    supabase.from("psychometric_tests").select("title,category").eq("id", attempt.test_id).maybeSingle<{ title: string | null; category: string | null }>(),
    attempt.order_id ? supabase.from("psychometric_orders").select("id,payment_status").eq("id", attempt.order_id).maybeSingle<{ id: string; payment_status: string | null }>() : Promise.resolve({ data: null, error: null }),
    attempt.report_id ? supabase.from("psychometric_reports").select("id").eq("id", attempt.report_id).maybeSingle<{ id: string }>() : Promise.resolve({ data: null, error: null }),
    supabase.from("psychometric_questions").select("id,question_text,question_type,weight,max_scale_value,sort_order,metadata,is_active").eq("test_id", attempt.test_id).order("sort_order"),
    supabase.from("psychometric_question_options").select("id,question_id,option_text,score_value,is_active,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("psychometric_answers").select("id,question_id,option_id,selected_values,numeric_value,answer_text,awarded_score,created_at,updated_at").eq("attempt_id", attempt.id),
  ]);

  const questions = (questionsQ.data ?? []) as QuestionRow[];
  const options = ((optionsQ.data ?? []) as OptionRow[]).filter((o) => questions.some((q) => q.id === o.question_id));
  const answers = (answersQ.data ?? []) as AnswerRow[];

  const optionsById = new Map(options.map((o) => [o.id, o]));
  const optionTextFor = (id: string | null | undefined) => (!id ? null : optionsById.get(id)?.option_text ?? id);

  const maxPerQuestion: Record<string, number> = {};
  for (const q of questions) {
    const weight = Number(q.weight ?? 1);
    const qOptions = options.filter((o) => o.question_id === q.id);
    if (q.question_type === "single_choice") {
      maxPerQuestion[q.id] = Math.max(0, ...qOptions.map((o) => Number(o.score_value ?? 0))) * weight;
    } else if (q.question_type === "multiple_choice") {
      maxPerQuestion[q.id] = qOptions.reduce((sum, o) => sum + Math.max(0, Number(o.score_value ?? 0)), 0) * weight;
    } else if (q.question_type === "scale") {
      maxPerQuestion[q.id] = Math.max(0, Number(q.max_scale_value ?? 0)) * weight;
    } else {
      maxPerQuestion[q.id] = 0;
    }
  }
  const computedMax = Object.values(maxPerQuestion).reduce((sum, value) => sum + Number(value || 0), 0);
  return (
    <div className="space-y-4 p-3 md:p-6">
      <PsychometricAdminHeader title="Attempt Detail" description="Review scoring inputs, answers, and report linkage for one attempt." breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Psychometric", href: "/admin/psychometric" }, { label: "Attempts", href: "/admin/psychometric/attempts" }, { label: attempt.id }]}
        action={<Link href="/admin/psychometric/attempts" className="rounded border px-3 py-1.5 text-sm">Review Attempts</Link>} />
      <PsychometricAdminSubnav currentPath="/admin/psychometric/attempts" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/psychometric/attempts" className="rounded border px-3 py-1.5">Back to Attempts</Link>
          {attempt.report_id && <Link href={`/admin/psychometric/reports/${attempt.report_id}`} className="rounded border px-3 py-1.5">View Report</Link>}
          {attempt.report_id && <a href={`/api/psychometric/reports/${attempt.report_id}/download`} className="rounded border px-3 py-1.5">Download PDF</a>}
          {attempt.report_id && <form action={`/api/admin/psychometric/reports/${attempt.report_id}/regenerate`} method="post"><button className="rounded bg-brand-600 px-3 py-1.5 text-white" type="submit">Regenerate Report</button></form>}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Student</div><div className="font-medium">{studentQ.data?.full_name ?? "Unknown"}</div><div className="text-sm text-slate-600">{studentQ.data?.email ?? "—"}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Test</div><div className="font-medium">{testQ.data?.title ?? "—"}</div><div className="text-sm text-slate-600">{testQ.data?.category ?? "—"}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Order</div><div className="font-medium">{attempt.order_id ?? "—"}</div><span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${statusTone(orderQ.data?.payment_status)}`}>{orderQ.data?.payment_status ?? "unlinked"}</span></div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Attempt status</div><span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${statusTone(attempt.status)}`}>{attempt.status ?? "unknown"}</span></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Created</div><div className="text-sm">{fmt(attempt.created_at)}</div><div className="text-xs text-slate-500 mt-1">Completed: {fmt(attempt.completed_at)}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Score</div><div className="font-medium">{Number(attempt.total_score ?? 0)} / {Number(attempt.max_score ?? computedMax)}</div><div className="text-sm text-slate-600">{Number(attempt.percentage_score ?? 0).toFixed(2)}%</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Result band</div><div className="font-medium">{attempt.result_band ?? "—"}</div><div className="text-sm text-slate-600">Report: {reportQ.data?.id ?? "Not linked"}</div></div>
      </section>

      <section className="rounded border bg-white p-3">
        <h2 className="mb-2 font-medium">Answer Review</h2>
        {answers.length === 0 ? <div className="rounded border border-dashed p-4 text-sm text-slate-500">No saved answers for this attempt.</div> :
          <div className="space-y-2">
            {questions.map((q, idx) => {
              const answer = answers.find((a) => a.question_id === q.id);
              const multipleOptionText = (answer?.selected_values ?? []).map((id) => optionTextFor(id));
              return <div key={q.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">Q{idx + 1}. {q.question_text}</div><div className="text-xs text-slate-500">{q.question_type}</div></div>
                <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
                  <div><span className="text-slate-500">single-choice option_text:</span> {optionTextFor(answer?.option_id) ?? "—"}</div>
                  <div><span className="text-slate-500">multiple-choice option_text[]:</span> {multipleOptionText.length ? multipleOptionText.join(", ") : "—"}</div>
                  <div><span className="text-slate-500">scale numeric_value:</span> {answer?.numeric_value ?? "—"}</div>
                  <div><span className="text-slate-500">numeric answer:</span> {answer?.numeric_value ?? "—"}</div>
                  <div><span className="text-slate-500">text answer:</span> {answer?.answer_text ?? "—"}</div>
                  <div><span className="text-slate-500">awarded_score:</span> {Number(answer?.awarded_score ?? 0)} / {Number(maxPerQuestion[q.id] ?? 0)}</div>
                  <div className="md:col-span-2"><span className="text-slate-500">saved:</span> {fmt(answer?.updated_at ?? answer?.created_at ?? null)}</div>
                </div>
              </div>;
            })}
          </div>
        }
      </section>

      <details className="rounded border bg-white p-3">
        <summary className="cursor-pointer font-medium">Advanced Details (raw JSON)</summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify({ attempt, student: studentQ.data, test: testQ.data, order: orderQ.data, report: reportQ.data, questions, options, answers }, null, 2)}</pre>
      </details>
    </div>
  );
}
