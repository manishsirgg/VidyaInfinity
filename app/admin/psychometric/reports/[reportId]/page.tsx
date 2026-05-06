import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type ReportRow = {
  id: string;
  attempt_id: string;
  test_id: string;
  user_id: string;
  order_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage_score: number | null;
  result_band: string | null;
  delivery_status: string | null;
  generated_at: string | null;
  updated_at: string | null;
  summary: string | null;
  strengths: string[] | null;
  improvement_areas: string[] | null;
  recommendations: string[] | null;
  dimension_scores: Record<string, unknown> | null;
  disclaimer: string | null;
  answers_snapshot: unknown[] | null;
  report_json: Record<string, unknown> | null;
  report_html: string | null;
};

type AttemptRow = {
  id: string;
  status: string | null;
  order_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AnswerRow = { awarded_score: number | null; updated_at: string | null };

type QuestionRow = { id: string; question_type: string; max_scale_value: number | null; scoring_config: Record<string, unknown> | null };
type OptionRow = { question_id: string; score_value: number | null };

const tone = (status?: string | null) => {
  const s = (status ?? "unknown").toLowerCase();
  if (s.includes("completed") || s.includes("paid") || s.includes("delivered")) return "bg-emerald-100 text-emerald-800";
  if (s.includes("cancel") || s.includes("fail") || s.includes("error")) return "bg-rose-100 text-rose-800";
  if (s.includes("progress") || s.includes("pending") || s.includes("queued")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item ?? "")).filter(Boolean) : []);

export default async function ReportDetail({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string }>();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: report } = await supabase.from("psychometric_reports").select("*").eq("id", reportId).maybeSingle<ReportRow>();
  if (!report) return <div className="p-4 text-sm text-rose-700">Report not found.</div>;

  const [studentQ, testQ, attemptQ, orderQ, answersQ, questionsQ, optionsQ] = await Promise.all([
    supabase.from("profiles").select("full_name,email").eq("id", report.user_id).maybeSingle<{ full_name: string | null; email: string | null }>(),
    supabase.from("psychometric_tests").select("title,category").eq("id", report.test_id).maybeSingle<{ title: string | null; category: string | null }>(),
    supabase.from("test_attempts").select("id,status,order_id,created_at,updated_at").eq("id", report.attempt_id).maybeSingle<AttemptRow>(),
    report.order_id ? supabase.from("psychometric_orders").select("id,payment_status").eq("id", report.order_id).maybeSingle<{ id: string; payment_status: string | null }>() : Promise.resolve({ data: null, error: null }),
    supabase.from("psychometric_answers").select("awarded_score,updated_at").eq("attempt_id", report.attempt_id).returns<AnswerRow[]>(),
    supabase.from("psychometric_questions").select("id,question_type,max_scale_value,scoring_config").eq("test_id", report.test_id).eq("is_active", true).returns<QuestionRow[]>(),
    supabase.from("psychometric_question_options").select("question_id,score_value").returns<OptionRow[]>(),
  ]);

  const answers = answersQ.data ?? [];
  const questions = questionsQ.data ?? [];
  const options = (optionsQ.data ?? []).filter((opt) => questions.some((q) => q.id === opt.question_id));

  const answersSnapshotCount = Array.isArray(report.answers_snapshot) ? report.answers_snapshot.length : 0;
  const hasPositiveAwarded = answers.some((a) => Number(a.awarded_score ?? 0) > 0);
  const latestAnswerUpdatedAtMs = answers.reduce((latest, answer) => {
    const current = answer.updated_at ? new Date(answer.updated_at).getTime() : 0;
    return Math.max(latest, current);
  }, 0);
  const generatedAtMs = report.generated_at ? new Date(report.generated_at).getTime() : 0;

  const scorableExists = questions.some((q) => {
    if (q.question_type === "scale") return Number(q.max_scale_value ?? 0) > 0;
    if (q.question_type === "single_choice" || q.question_type === "multiple_choice") {
      return options.some((o) => o.question_id === q.id && Number(o.score_value ?? 0) > 0);
    }
    return Number((q.scoring_config as { max_score?: number } | null)?.max_score ?? 0) > 0;
  });

  const staleReasons: string[] = [];
  if (answers.length > 0 && answersSnapshotCount === 0) staleReasons.push("Answers exist but answers_snapshot is empty.");
  if (Number(report.total_score ?? 0) === 0 && hasPositiveAwarded) staleReasons.push("total_score is 0 while at least one answer has awarded_score > 0.");
  if (Number(report.max_score ?? 0) === 0 && scorableExists) staleReasons.push("max_score is 0 while scorable questions/options exist.");
  if (generatedAtMs > 0 && latestAnswerUpdatedAtMs > generatedAtMs) staleReasons.push("Answers were updated after report generated_at.");

  const percentage = Number(report.percentage_score ?? 0);
  const premiumStrengths = asList(report.strengths);
  const premiumImprovements = asList(report.improvement_areas);
  const premiumRecommendations = asList(report.recommendations);
  const reportJsonPreview = JSON.stringify(report.report_json ?? {}, null, 2);

  return (
    <div className="space-y-4 p-3 md:p-6">
      <div className="text-sm text-slate-600"><Link href="/admin/psychometric" className="underline">Psychometric</Link> / <Link href="/admin/psychometric/reports" className="underline">Reports</Link> / <span>{report.id}</span></div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">Admin Psychometric Report Detail</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <form action={`/api/admin/psychometric/reports/${reportId}/regenerate`} method="post"><button className="rounded bg-brand-600 px-3 py-1.5 text-white" type="submit">Regenerate Report</button></form>
          <a className="rounded border px-3 py-1.5" href={`/api/psychometric/reports/${reportId}/download`}>Download PDF</a>
          <Link href={`/admin/psychometric/attempts/${report.attempt_id}`} className="rounded border px-3 py-1.5">View Student Attempt</Link>
          <Link href="/admin/psychometric/reports" className="rounded border px-3 py-1.5">Back to Reports</Link>
        </div>
      </div>

      {staleReasons.length > 0 && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-medium">Stale report warning</div><ul className="mt-1 list-disc space-y-1 pl-5">{staleReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-2 text-xs">Use <span className="font-semibold">Regenerate Report</span> to refresh snapshot and scores.</p></div>}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Student</div><div className="font-medium">{studentQ.data?.full_name ?? "Unknown"}</div><div className="text-sm text-slate-600">{studentQ.data?.email ?? "—"}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Test</div><div className="font-medium">{testQ.data?.title ?? "—"}</div><div className="text-sm text-slate-600">{testQ.data?.category ?? "—"}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Attempt</div><div className="font-medium break-all">{attemptQ.data?.id ?? report.attempt_id}</div><span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${tone(attemptQ.data?.status)}`}>{attemptQ.data?.status ?? "unknown"}</span></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Order</div><div className="font-medium break-all">{orderQ.data?.id ?? report.order_id ?? "—"}</div><span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${tone(orderQ.data?.payment_status)}`}>{orderQ.data?.payment_status ?? "unlinked"}</span></div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Generated</div><div className="text-sm">{fmt(report.generated_at)}</div><div className="mt-1 text-xs text-slate-500">Updated: {fmt(report.updated_at)}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Delivery status</div><span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${tone(report.delivery_status)}`}>{report.delivery_status ?? "pending"}</span></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Result band</div><div className="font-medium">{report.result_band ?? "—"}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Answers snapshot count</div><div className="font-medium">{answersSnapshotCount}</div></div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Total score</div><div className="text-2xl font-semibold">{Number(report.total_score ?? 0)}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Max score</div><div className="text-2xl font-semibold">{Number(report.max_score ?? 0)}</div></div>
        <div className="rounded border bg-white p-3"><div className="text-xs text-slate-500">Percentage</div><div className="text-2xl font-semibold">{percentage.toFixed(2)}%</div><div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} /></div></div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-medium">Premium Report Preview</h2>
        <div className="mt-3 space-y-3 text-sm">
          <div><div className="text-xs text-slate-500">Summary</div><p className="mt-1 whitespace-pre-wrap">{report.summary ?? "—"}</p></div>
          <div><div className="text-xs text-slate-500">Strengths</div>{premiumStrengths.length ? <ul className="mt-1 list-disc pl-5">{premiumStrengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1">—</p>}</div>
          <div><div className="text-xs text-slate-500">Improvement areas</div>{premiumImprovements.length ? <ul className="mt-1 list-disc pl-5">{premiumImprovements.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1">—</p>}</div>
          <div><div className="text-xs text-slate-500">Recommendations</div>{premiumRecommendations.length ? <ul className="mt-1 list-disc pl-5">{premiumRecommendations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1">—</p>}</div>
          <div><div className="text-xs text-slate-500">Dimension scores</div><pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(report.dimension_scores ?? {}, null, 2)}</pre></div>
          <div><div className="text-xs text-slate-500">Disclaimer</div><p className="mt-1">{report.disclaimer ?? "This report is intended for guidance and should be interpreted with professional context."}</p></div>
        </div>
      </section>

      <details className="rounded border bg-white p-3">
        <summary className="cursor-pointer font-medium">Advanced report_json preview</summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-50 p-3 text-xs">{reportJsonPreview}</pre>
      </details>

      <details className="rounded border bg-white p-3">
        <summary className="cursor-pointer font-medium">Advanced report_html preview</summary>
        <div className="prose prose-sm mt-2 max-w-none rounded border bg-slate-50 p-3" dangerouslySetInnerHTML={{ __html: report.report_html ?? "" }} />
      </details>
    </div>
  );
}
