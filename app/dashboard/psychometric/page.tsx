import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { derivePsychometricState, isPaidPsychometricOrder, resolveAttemptReportId, type AttemptLite, type ReportLite } from "@/lib/psychometric/dashboard";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TestRow = { id: string; title: string | null; slug: string | null };
type OrderRow = {
  id: string;
  user_id: string;
  test_id: string | null;
  payment_status: string | null;
  final_amount: number | null;
  final_paid_amount: number | null;
  paid_at: string | null;
  created_at: string;
  attempt_id: string | null;
  legacy_report_url: string | null;
};

type DashboardOrder = OrderRow & {
  test?: TestRow | null;
  attempt?: (AttemptLite & { order_id?: string | null }) | null;
  report?: ReportLite | null;
};


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
  const { user, profile } = await requireUser("student");
  const supabase = await createClient();
  const resolvedProfile = { id: profile.id, role: profile.role };
  console.log("[psychometric-profile]", { authUserId: user.id, profileId: resolvedProfile.id, role: resolvedProfile.role ?? null });

  const { data: orders, error: ordersError } = await supabase
    .from("psychometric_orders")
    .select("id,user_id,test_id,payment_status,final_amount,final_paid_amount,paid_at,created_at,attempt_id,legacy_report_url")
    .eq("user_id", resolvedProfile.id)
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();

  console.log("[psychometric-dashboard-orders]", {
    profileId: resolvedProfile.id,
    ordersCount: orders?.length ?? 0,
    ordersError: ordersError?.message ?? null,
  });

  if (ordersError) {
    console.error("[psychometric-dashboard] order query failed", {
      authUserId: user.id,
      profileId: resolvedProfile.id,
      error: ordersError.message,
    });
  }

  const testIds = Array.from(new Set((orders ?? []).map((order) => order.test_id).filter((value): value is string => Boolean(value))));
  const orderIds = (orders ?? []).map((order) => order.id);
  const attemptIdsFromOrder = Array.from(new Set((orders ?? []).map((order) => order.attempt_id).filter((value): value is string => Boolean(value))));

  const { data: tests, error: testsError } = testIds.length
    ? await supabase.from("psychometric_tests").select("id,title,slug").in("id", testIds).returns<TestRow[]>()
    : { data: [] as TestRow[], error: null };

  if (testsError) console.error("[psychometric-dashboard] test query failed", { profileId: resolvedProfile.id, error: testsError.message });

  const { data: attemptsByOrder, error: attemptsByOrderError } = orderIds.length
    ? await supabase.from("test_attempts").select("id,status,report_id,order_id").in("order_id", orderIds)
    : { data: [], error: null };

  const { data: attemptsByAttemptId, error: attemptsByAttemptIdError } = attemptIdsFromOrder.length
    ? await supabase.from("test_attempts").select("id,status,report_id,order_id").in("id", attemptIdsFromOrder)
    : { data: [], error: null };

  if (attemptsByOrderError || attemptsByAttemptIdError) {
    console.error("[psychometric-dashboard] attempt query failed", {
      byOrderError: attemptsByOrderError?.message ?? null,
      byAttemptIdError: attemptsByAttemptIdError?.message ?? null,
    });
  }

  const attempts = [...(attemptsByOrder ?? []), ...(attemptsByAttemptId ?? [])] as (AttemptLite & { order_id?: string | null })[];
  const uniqueAttempts = Array.from(new Map(attempts.map((attempt) => [attempt.id, attempt])).values());
  const resolvedAttemptIds = uniqueAttempts.map((attempt) => attempt.id);

  console.log("[dashboard-psychometric-final]", {
    profileId: resolvedProfile.id,
    ordersCount: orders?.length ?? 0,
    attemptIds: attemptIdsFromOrder,
    attemptsCount: uniqueAttempts.length,
    firstOrderId: orders?.[0]?.id ?? null,
    firstAttemptId: uniqueAttempts[0]?.id ?? null,
    error: ordersError?.message
  });

  const { data: reports, error: reportsError } = resolvedAttemptIds.length
    ? await supabase.from("psychometric_reports").select("id,attempt_id").in("attempt_id", resolvedAttemptIds).returns<ReportLite[]>()
    : { data: [] as ReportLite[], error: null };

  if (reportsError) console.error("[psychometric-dashboard] report query failed", { error: reportsError.message });

  const byAttempt = new Map(uniqueAttempts.map((attempt) => [attempt.id, attempt]));
  const byAttemptFromOrderId = new Map(uniqueAttempts.filter((attempt) => attempt.order_id).map((attempt) => [attempt.order_id as string, attempt]));
  const byReportAttempt = new Map((reports ?? []).filter((report) => report.attempt_id).map((report) => [report.attempt_id as string, report]));
  const testsById = new Map((tests ?? []).map((test) => [test.id, test]));

  const dashboardOrders: DashboardOrder[] = (orders ?? []).map((order) => {
    const attempt = (order.attempt_id ? byAttempt.get(order.attempt_id) : null) ?? byAttemptFromOrderId.get(order.id) ?? null;
    const test = order.test_id ? testsById.get(order.test_id) ?? null : null;
    const report = attempt ? byReportAttempt.get(attempt.id) ?? null : null;
    return { ...order, attempt, test, report };
  });

  if (!dashboardOrders.length) {
    return <div className="mx-auto max-w-4xl px-4 py-10"><div className="rounded-2xl border border-dashed bg-white p-8 text-center"><h1 className="text-2xl font-semibold">Psychometric Dashboard</h1><p className="mt-2 text-slate-600">No psychometric orders yet. Start with an assessment to unlock your personalized report.</p><Link className="mt-5 inline-flex rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white" href="/psychometric-tests">Explore tests</Link></div></div>;
  }

  return <div className="mx-auto max-w-6xl px-4 py-8"><h1 className="mb-5 text-2xl font-semibold">Psychometric Dashboard</h1><div className="grid gap-4">{dashboardOrders.map((o) => { const a = o.attempt ?? null; const paid = isPaidPsychometricOrder(o.payment_status, o.paid_at); const testRef = o.test ?? null; const slug = testRef?.slug ?? null; const reportId = resolveAttemptReportId(a, byReportAttempt); const state = derivePsychometricState({ paid, attempt: a, resolvedReportId: reportId, hasLegacyReportUrl: Boolean(o.legacy_report_url) });
  return <div key={o.id} className="rounded-xl border bg-white p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">{testRef?.title ?? "Psychometric Test"}</h2><p className="text-sm text-slate-600">Order: {o.id.slice(0, 8)}…</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs ${stateBadge[state]}`}>{state.replaceAll("_", " ")}</span><p className="text-sm font-medium">₹{o.final_paid_amount ?? o.final_amount ?? 0}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{state === "payment_pending" && slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Retry payment</Link> : null}{state === "in_progress" && a ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Continue test</Link> : null}{(state === "ready_to_start" || state === "paid_attempt_missing") ? (a ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start Test</Link> : slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start Test</Link> : null) : null}{reportId ? <Link href={`/dashboard/psychometric/reports/${reportId}`} className="rounded border px-3 py-2 text-sm">View report</Link> : null}{reportId ? <a href={`/api/psychometric/reports/${reportId}/download`} className="rounded border px-3 py-2 text-sm">Download report</a> : null}{!reportId && o.legacy_report_url ? <a href={o.legacy_report_url} className="rounded border px-3 py-2 text-sm">Open legacy report</a> : null}</div></div>; })}</div></div>;

}
