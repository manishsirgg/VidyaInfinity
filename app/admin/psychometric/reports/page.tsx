/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PsychometricAdminCard,
  PsychometricAdminHeader,
  PsychometricAdminSubnav,
  PsychometricEmptyState,
  PsychometricStatusBadge,
} from "@/app/admin/psychometric/_components/AdminPsychometricUI";
import { createClient } from "@/lib/supabase/server";

type Params = { q?: string; band?: string; stale?: "all" | "yes" | "no"; test?: string; success?: string; error?: string };

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: reports, error } = await supabase.from("psychometric_reports").select("*").order("created_at", { ascending: false }).limit(200);
  const attemptIds = [...new Set((reports ?? []).map((r: any) => r.attempt_id).filter(Boolean))];
  const { data: attempts } = attemptIds.length ? await supabase.from("test_attempts").select("id,user_id,test_id,total_score,max_score,percentage_score,completed_at,updated_at").in("id", attemptIds) : { data: [] };
  const attemptsMap = new Map((attempts ?? []).map((a: any) => [a.id, a]));
  const userIds = [...new Set((attempts ?? []).map((a: any) => a.user_id).filter(Boolean))];
  const testIds = [...new Set((attempts ?? []).map((a: any) => a.test_id).filter(Boolean))];

  const [{ data: users }, { data: tests }, { data: answers }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] }),
    testIds.length ? supabase.from("psychometric_tests").select("id,title").in("id", testIds) : Promise.resolve({ data: [] }),
    attemptIds.length ? supabase.from("psychometric_answers").select("attempt_id,awarded_score,updated_at").in("attempt_id", attemptIds) : Promise.resolve({ data: [] }),
  ] as const);

  const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));
  const testsMap = new Map((tests ?? []).map((t: any) => [t.id, t]));
  const answersByAttempt = new Map<string, any[]>();
  (answers ?? []).forEach((ans: any) => {
    const prev = answersByAttempt.get(ans.attempt_id) ?? [];
    prev.push(ans);
    answersByAttempt.set(ans.attempt_id, prev);
  });

  const enriched = (reports ?? []).map((r: any) => {
    const attempt = attemptsMap.get(r.attempt_id);
    const student = usersMap.get(attempt?.user_id);
    const test = testsMap.get(attempt?.test_id);
    const attemptAnswers = answersByAttempt.get(r.attempt_id) ?? [];
    const reasons: string[] = [];
    if ((r.total_score ?? 0) === 0 && attemptAnswers.some((a) => (a.awarded_score ?? 0) > 0)) reasons.push("zero score with scored answers");
    if (!r.report_snapshot || (typeof r.report_snapshot === "object" && Object.keys(r.report_snapshot).length === 0 && attemptAnswers.length > 0)) reasons.push("empty snapshot with answers");
    if ((r.max_score ?? 0) === 0 && attemptAnswers.length > 0) reasons.push("max score zero with scorable questions");
    if (r.created_at && attemptAnswers.some((a) => a.updated_at && new Date(a.updated_at).getTime() > new Date(r.created_at).getTime())) reasons.push("answers updated after report generation");
    return { r, attempt, student, test, stale: reasons.length > 0, reasons };
  });

  const filtered = enriched.filter((item) => {
    const q = (params.q ?? "").trim().toLowerCase();
    const band = (params.band ?? "all").toLowerCase();
    const stale = params.stale ?? "all";
    if (q && ![item.r.id, item.student?.full_name, item.student?.email, item.test?.title].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
    if (band !== "all" && String(item.r.result_band ?? "").toLowerCase() !== band) return false;
    if (params.test && item.attempt?.test_id !== params.test) return false;
    if (stale === "yes" && !item.stale) return false;
    if (stale === "no" && item.stale) return false;
    return true;
  });

  const resultBands = [...new Set((reports ?? []).map((r: any) => r.result_band).filter(Boolean))];

  return <div className="space-y-4 p-3 md:p-6">
    <PsychometricAdminHeader title="Report Monitoring" description="Review psychometric reports, stale signals, and delivery status." breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Psychometric", href: "/admin/psychometric" }, { label: "Reports" }]} /><PsychometricAdminSubnav currentPath="/admin/psychometric/reports" />
    {params.success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{params.success}</p>}
    {params.error && <p className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{params.error}</p>}

    <PsychometricAdminCard><form className="grid gap-2 md:grid-cols-5"><input name="q" placeholder="Search by student, test, report ID" defaultValue={params.q ?? ""} className="rounded border p-2 text-sm" /><select name="band" defaultValue={params.band ?? "all"} className="rounded border p-2 text-sm"><option value="all">All bands</option>{resultBands.map((band) => <option key={band} value={band}>{band}</option>)}</select><select name="stale" defaultValue={params.stale ?? "all"} className="rounded border p-2 text-sm"><option value="all">All freshness</option><option value="yes">Stale/Broken</option><option value="no">Healthy</option></select><select name="test" defaultValue={params.test ?? ""} className="rounded border p-2 text-sm"><option value="">All tests</option>{[...testsMap.values()].map((t: any) => <option key={t.id} value={t.id}>{t.title ?? t.id}</option>)}</select><button className="rounded border px-3 py-2 text-sm">Apply Filters</button></form></PsychometricAdminCard>

    {error ? <PsychometricEmptyState title="Unable to load reports" subtitle={error.message} /> : filtered.length === 0 ? <PsychometricEmptyState title="No reports found" subtitle="Try broadening your filters." /> : <>
      <div className="hidden overflow-x-auto rounded-xl border bg-white lg:block"><table className="min-w-[1250px] text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Student</th><th className="text-left">Test</th><th>Total/Max</th><th>%</th><th>Band</th><th>Generated</th><th>Stale status</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>{filtered.map(({ r, student, test, attempt, stale, reasons }) => <tr key={r.id} className="border-t align-top"><td className="p-3"><p className="font-medium">{student?.full_name ?? "Unknown Student"}</p><p className="text-xs text-slate-500 break-all">{student?.email ?? "—"}</p><p className="mt-1 text-xs text-slate-500 break-all">{r.id}</p></td><td>{test?.title ?? "Unknown test"}</td><td>{r.total_score ?? attempt?.total_score ?? 0}/{r.max_score ?? attempt?.max_score ?? 0}</td><td>{r.percentage_score ?? attempt?.percentage_score ?? 0}%</td><td>{r.result_band ?? "—"}</td><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td><td><div className="flex flex-wrap gap-1">{stale ? reasons.map((reason) => <PsychometricStatusBadge key={reason} label={reason} tone="amber" />) : <PsychometricStatusBadge label="healthy" tone="emerald" />}</div></td><td><PsychometricStatusBadge label={r.delivery_status ?? "pending"} tone={r.delivery_status === "delivered" ? "emerald" : "blue"} /></td><td className="space-x-2 whitespace-nowrap"><Link href={`/admin/psychometric/reports/${r.id}`} className="underline">View Report</Link>{attempt?.id ? <Link href={`/admin/psychometric/attempts/${attempt.id}`} className="underline">View Attempt</Link> : null}<a href={`/api/psychometric/reports/${r.id}/download`} className="underline">Download PDF</a><form className="inline" action={`/api/admin/psychometric/reports/${r.id}/regenerate`} method="post"><button className="underline">Regenerate</button></form></td></tr>)}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{filtered.map(({ r, student, test, attempt, stale, reasons }) => <PsychometricAdminCard key={r.id}><div className="space-y-2 text-sm"><p className="font-medium break-words">{student?.full_name ?? "Unknown Student"}</p><p className="text-xs text-slate-500 break-all">{student?.email ?? "—"}</p><p className="text-xs text-slate-500 break-all">{r.id}</p><p className="font-medium break-words">{test?.title ?? "Unknown test"}</p><p>{r.total_score ?? attempt?.total_score ?? 0}/{r.max_score ?? attempt?.max_score ?? 0} · {r.percentage_score ?? attempt?.percentage_score ?? 0}% · {r.result_band ?? "—"}</p><div className="flex flex-wrap gap-1">{stale ? reasons.map((reason) => <PsychometricStatusBadge key={reason} label={reason} tone="amber" />) : <PsychometricStatusBadge label="healthy" tone="emerald" />}</div><PsychometricStatusBadge label={r.delivery_status ?? "pending"} tone={r.delivery_status === "delivered" ? "emerald" : "blue"} /><div className="flex flex-wrap gap-3"><Link href={`/admin/psychometric/reports/${r.id}`} className="underline">View Report</Link>{attempt?.id ? <Link href={`/admin/psychometric/attempts/${attempt.id}`} className="underline">View Attempt</Link> : null}<a href={`/api/psychometric/reports/${r.id}/download`} className="underline">Download PDF</a><form action={`/api/admin/psychometric/reports/${r.id}/regenerate`} method="post"><button className="underline">Regenerate</button></form></div></div></PsychometricAdminCard>)}</div>
    </>}
  </div>;
}
