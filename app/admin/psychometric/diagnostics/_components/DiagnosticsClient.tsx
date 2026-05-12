"use client";

import Link from "next/link";
import { PsychometricAdminCard, PsychometricAdminHeader, PsychometricAdminSubnav, PsychometricStatusBadge } from "@/app/admin/psychometric/_components/AdminPsychometricUI";
import { useCallback, useEffect, useState } from "react";

type RecentOrder = { id: string; payment_status: string | null; attempt_id: string | null };
type RecentAttempt = { id: string; status: string | null; report_id: string | null };
type RecentReport = { id: string; attempt_id: string | null };
type RecentAnswer = { id: string; attempt_id: string | null; awarded_score: number | null };

type DiagnosticsResponse = {
  counters: Record<string, number>;
  broken: Record<string, number>;
  checklist: {
    requiredTablesExist: Record<string, boolean>;
    requiredColumnsExist: Record<string, boolean>;
    helpersExist: Record<string, boolean>;
    psychometricAnswersPoliciesUseHelperBasedOwnership: boolean;
    noActiveOptionLabelUsageInDbFacingCode: boolean;
  };
  recent: { orders: RecentOrder[]; attempts: RecentAttempt[]; reports: RecentReport[]; answers: RecentAnswer[] };
};

export default function PsychometricDiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/psychometric/diagnostics", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to refresh diagnostics");
      setData(json);
    } catch (e) {
      setBanner({ kind: "error", message: e instanceof Error ? e.message : "Failed to refresh diagnostics" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const runAction = async (url: string) => {
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      if (url.includes("reconcile") && Number(json.repairedOrders ?? 0) === 0 && Number(json.createdAttempts ?? 0) === 0 && Number(json.linkedAttempts ?? 0) === 0 && Number(json.createdReports ?? 0) === 0) {
        setBanner({ kind: "success", message: "System is already consistent. No repairs were needed." });
      } else {
        setBanner({ kind: "success", message: "Action completed successfully." });
      }
      await refresh();
    } catch (e) {
      setBanner({ kind: "error", message: e instanceof Error ? e.message : "Action failed" });
      setLoading(false);
    }
  };

  return <div className="space-y-6 bg-slate-50/60 p-3 pb-10 md:p-6">
    <PsychometricAdminHeader title="Psychometric Diagnostics" description="Run health checks and reconcile broken psychometric data." breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Psychometric", href: "/admin/psychometric" }, { label: "Diagnostics" }]} /><PsychometricAdminSubnav currentPath="/admin/psychometric/diagnostics" />
    <div className="flex flex-wrap gap-3">
      <button disabled={loading} className="rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-60" onClick={() => void runAction("/api/admin/psychometric/reconcile")}>Run Reconcile</button>
      <button disabled={loading} className="rounded border px-3 py-2 text-sm disabled:opacity-60" onClick={() => void runAction("/api/admin/psychometric/reports/regenerate-broken")}>Regenerate Broken Reports</button>
      <button disabled={loading} className="rounded border px-3 py-2 text-sm disabled:opacity-60" onClick={() => void refresh()}>Refresh Diagnostics</button>
    </div>
    {banner && <p className={`rounded border p-3 text-sm ${banner.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{banner.message}</p>}
    {loading && <p className="text-sm text-slate-500">Loading diagnostics...</p>}

    <section><h2 className="mb-2 text-lg font-medium">System Health</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data?.counters ?? {}).map(([k, v]) => <PsychometricAdminCard key={k}><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-semibold">{v}</p><div className="mt-2"><PsychometricStatusBadge label={Number(v) > 0 ? "active" : "idle"} tone={Number(v) > 0 ? "blue" : "slate"} /></div></PsychometricAdminCard>)}</div></section>
    <section><h2 className="mb-2 text-lg font-medium">Broken State Counters</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(data?.broken ?? {}).map(([k, v]) => <PsychometricAdminCard key={k}><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-semibold">{v}</p><div className="mt-2"><PsychometricStatusBadge label={Number(v) === 0 ? "healthy" : Number(v) < 5 ? "warning" : "error"} tone={Number(v) === 0 ? "emerald" : Number(v) < 5 ? "amber" : "rose"} /></div></PsychometricAdminCard>)}</div></section>
    <section><h2 className="mb-2 text-lg font-medium">Schema / Helper / RLS Checklist</h2><pre className="overflow-auto rounded border bg-white p-3 overflow-x-auto text-xs">{JSON.stringify(data?.checklist ?? {}, null, 2)}</pre></section>

    <section className="space-y-4">
      <h2 className="text-lg font-medium">Recent Activity</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-3 overflow-x-auto"><h3 className="mb-2 font-medium">Recent Orders</h3>{(data?.recent.orders ?? []).map((o) => <div key={o.id} className="border-t py-2 text-sm"><div>{o.id}</div><div className="text-xs text-slate-600">{o.payment_status}</div>{o.attempt_id && <Link className="underline" href={`/admin/psychometric/attempts/${o.attempt_id}`}>View attempt detail</Link>}</div>)}</div>
        <div className="rounded border bg-white p-3 overflow-x-auto"><h3 className="mb-2 font-medium">Recent Attempts</h3>{(data?.recent.attempts ?? []).map((a) => <div key={a.id} className="border-t py-2 text-sm"><div>{a.id}</div><div className="text-xs text-slate-600">{a.status}</div><Link className="underline" href={`/admin/psychometric/attempts/${a.id}`}>View attempt detail</Link>{a.report_id && <> · <Link className="underline" href={`/admin/psychometric/reports/${a.report_id}`}>View report detail</Link></>}</div>)}</div>
        <div className="rounded border bg-white p-3 overflow-x-auto"><h3 className="mb-2 font-medium">Recent Reports</h3>{(data?.recent.reports ?? []).map((r) => <div key={r.id} className="border-t py-2 text-sm"><div>{r.id}</div><Link className="underline" href={`/admin/psychometric/reports/${r.id}`}>View report detail</Link>{r.attempt_id && <> · <Link className="underline" href={`/admin/psychometric/attempts/${r.attempt_id}`}>View attempt detail</Link></>}</div>)}</div>
        <div className="rounded border bg-white p-3 overflow-x-auto"><h3 className="mb-2 font-medium">Recent Answers</h3>{(data?.recent.answers ?? []).map((a) => <div key={a.id} className="border-t py-2 text-sm"><div>{a.id}</div><div className="text-xs text-slate-600">awarded_score: {a.awarded_score ?? 0}</div>{a.attempt_id && <Link className="underline" href={`/admin/psychometric/attempts/${a.attempt_id}`}>View attempt detail</Link>}</div>)}</div>
      </div>
      <div className="text-sm"><Link className="underline" href="/admin/psychometric/tests">View test questions</Link></div>
    </section>
  </div>;
}
