import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { derivePsychometricState, isPaidPsychometricOrder, resolveAttemptReportId, type AttemptLite } from "@/lib/psychometric/dashboard";
import { createClient } from "@/lib/supabase/server";

type TestRef = { title: string | null; slug: string | null };
type OrderRow = { id: string; payment_status: string | null; final_amount: number | null; final_paid_amount: number | null; paid_at: string | null; created_at: string; attempt_id: string | null; legacy_report_url: string | null; psychometric_tests: TestRef[] | TestRef | null };
type ReportRow = { id: string; attempt_id: string | null };

const stateBadge: Record<string, string> = {
  payment_pending: "bg-amber-50 text-amber-700 border-amber-200",
  report_ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  ready_to_start: "bg-indigo-50 text-indigo-700 border-indigo-200",
  paid_attempt_missing: "bg-orange-50 text-orange-700 border-orange-200",
  completed_report_pending: "bg-rose-50 text-rose-700 border-rose-200",
  legacy_report_only: "bg-violet-50 text-violet-700 border-violet-200",
  unknown: "bg-slate-50 text-slate-700 border-slate-200",
};

export default async function Page() {
  const { profile } = await requireUser("student");
  const supabase = await createClient();
  const { data: orders } = await supabase.from("psychometric_orders").select("id,payment_status,final_amount,final_paid_amount,paid_at,created_at,attempt_id,legacy_report_url,psychometric_tests(title,slug)").eq("user_id", profile.id).order("created_at", { ascending: false }).returns<OrderRow[]>();
  const attemptIds = (orders ?? []).map((o) => o.attempt_id).filter((v): v is string => Boolean(v));
  const { data: attempts } = attemptIds.length ? await supabase.from("test_attempts").select("id,status,report_id").in("id", attemptIds).returns<AttemptLite[]>() : { data: [] as AttemptLite[] };
  const { data: reports } = attemptIds.length ? await supabase.from("psychometric_reports").select("id,attempt_id").in("attempt_id", attemptIds).returns<ReportRow[]>() : { data: [] as ReportRow[] };
  const byAttempt = new Map((attempts ?? []).map((a) => [a.id, a]));
  const byReportAttempt = new Map((reports ?? []).filter((r) => r.attempt_id).map((r) => [r.attempt_id as string, r]));

  if (!(orders ?? []).length) {
    return <div className="mx-auto max-w-4xl px-4 py-10"><div className="rounded-2xl border border-dashed bg-white p-8 text-center"><h1 className="text-2xl font-semibold">Psychometric Dashboard</h1><p className="mt-2 text-slate-600">No psychometric orders yet. Start with an assessment to unlock your personalized report.</p><Link className="mt-5 inline-flex rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white" href="/psychometric-tests">Explore tests</Link></div></div>;
  }

  return <div className="mx-auto max-w-6xl px-4 py-8"><h1 className="mb-5 text-2xl font-semibold">Psychometric Dashboard</h1><div className="grid gap-4">{(orders ?? []).map((o) => { const a = o.attempt_id ? byAttempt.get(o.attempt_id) ?? null : null; const paid = isPaidPsychometricOrder(o.payment_status, o.paid_at); const testRef = Array.isArray(o.psychometric_tests) ? o.psychometric_tests[0] : o.psychometric_tests; const slug = testRef?.slug ?? null; const reportId = resolveAttemptReportId(a, byReportAttempt); const state = derivePsychometricState({ paid, attempt: a, resolvedReportId: reportId, hasLegacyReportUrl: Boolean(o.legacy_report_url) });
  return <div key={o.id} className="rounded-xl border bg-white p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">{testRef?.title ?? "Psychometric Test"}</h2><p className="text-sm text-slate-600">Order: {o.id.slice(0, 8)}…</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs ${stateBadge[state]}`}>{state.replaceAll("_", " ")}</span><p className="text-sm font-medium">₹{o.final_paid_amount ?? o.final_amount ?? 0}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{state === "payment_pending" && slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Retry payment</Link> : null}{state === "in_progress" && a ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Continue test</Link> : null}{(state === "ready_to_start" || state === "paid_attempt_missing") ? (a ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start test</Link> : slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start test</Link> : null) : null}{reportId ? <Link href={`/dashboard/psychometric/reports/${reportId}`} className="rounded border px-3 py-2 text-sm">View report</Link> : null}{reportId ? <a href={`/api/psychometric/reports/${reportId}/download`} className="rounded border px-3 py-2 text-sm">Download report</a> : null}{!reportId && o.legacy_report_url ? <a href={o.legacy_report_url} className="rounded border px-3 py-2 text-sm">Open legacy report</a> : null}{(state === "report_ready" || state === "completed_report_pending" || state === "legacy_report_only") && slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded border px-3 py-2 text-sm">Retake test</Link> : null}</div></div>; })}</div></div>;
}
