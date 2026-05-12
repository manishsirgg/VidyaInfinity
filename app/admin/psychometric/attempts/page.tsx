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

type AttemptParams = {
  q?: string;
  status?: "all" | "not_started" | "in_progress" | "completed" | "cancelled" | "expired";
  test?: string;
};

const statusOptions: NonNullable<AttemptParams["status"]>[] = ["all", "not_started", "in_progress", "completed", "cancelled", "expired"];

const toneByStatus: Record<string, "emerald" | "rose" | "amber" | "blue" | "slate"> = {
  not_started: "slate",
  in_progress: "blue",
  completed: "emerald",
  cancelled: "rose",
  expired: "amber",
};

export default async function AttemptsPage({ searchParams }: { searchParams?: Promise<AttemptParams> }) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const selectedStatus = statusOptions.includes((params.status ?? "all") as any) ? (params.status ?? "all") : "all";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  let query = supabase
    .from("test_attempts")
    .select("id,status,total_score,percentage_score,report_id,user_id,test_id,order_id,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (selectedStatus !== "all") query = query.eq("status", selectedStatus);
  if (params.test) query = query.eq("test_id", params.test);

  const { data: attempts, error } = await query;
  const userIds = [...new Set((attempts ?? []).map((a) => a.user_id).filter(Boolean))];
  const testIds = [...new Set((attempts ?? []).map((a) => a.test_id).filter(Boolean))];
  const orderIds = [...new Set((attempts ?? []).map((a) => a.order_id).filter(Boolean))];

  const [{ data: users }, { data: tests }, { data: orders }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", userIds) : Promise.resolve({ data: [] }),
    testIds.length ? supabase.from("psychometric_tests").select("id,title").in("id", testIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("psychometric_orders").select("id,payment_status").in("id", orderIds) : Promise.resolve({ data: [] }),
  ] as const);

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
  const testMap = new Map((tests ?? []).map((t: any) => [t.id, t]));
  const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));

  const filtered = (attempts ?? []).filter((a: any) => {
    if (!q) return true;
    const profileItem = userMap.get(a.user_id);
    const test = testMap.get(a.test_id);
    const order = orderMap.get(a.order_id);
    return [a.id, a.order_id, profileItem?.full_name, profileItem?.email, test?.title, order?.id].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const testsForFilter = (tests ?? []).sort((a: any, b: any) => String(a.title ?? "").localeCompare(String(b.title ?? "")));

  return <div className="space-y-4 bg-slate-50/60 p-3 pb-10 md:p-6">
    <PsychometricAdminHeader
      title="Attempt Monitoring"
      description="Track student attempts, payment outcomes, and report readiness."
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Psychometric", href: "/admin/psychometric" }, { label: "Attempts" }]}
    />
    <PsychometricAdminSubnav currentPath="/admin/psychometric/attempts" />

    <PsychometricAdminCard><form className="grid gap-2 md:grid-cols-4"><input name="q" defaultValue={params.q ?? ""} placeholder="Search by student, test, order, or attempt ID" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
      <select name="status" defaultValue={selectedStatus} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">{statusOptions.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</option>)}</select>
      <select name="test" defaultValue={params.test ?? ""} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All tests</option>{testsForFilter.map((t: any) => <option key={t.id} value={t.id}>{t.title ?? t.id}</option>)}</select>
      <button className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700">Apply Filters</button></form></PsychometricAdminCard>

    {error ? <PsychometricEmptyState title="Unable to load attempts" subtitle={error.message} /> : filtered.length === 0 ? <PsychometricEmptyState title="No attempts found" subtitle="Try broadening search or clearing filters." /> : <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block"><table className="min-w-[1200px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-left">Student</th><th className="text-left">Test</th><th>Status</th><th>Payment</th><th>Score</th><th>Band</th><th>Created</th><th>Completed</th><th>Actions</th></tr></thead><tbody>{filtered.map((a: any) => {
        const p = userMap.get(a.user_id); const t = testMap.get(a.test_id); const o = orderMap.get(a.order_id);
        return <tr key={a.id} className="border-t align-top"><td className="p-3"><p className="font-medium">{p?.full_name ?? "Unknown Student"}</p><p className="text-xs text-slate-500 break-all">{p?.email ?? "—"}</p></td><td>{t?.title ?? "Unknown test"}</td><td><PsychometricStatusBadge label={a.status ?? "unknown"} tone={toneByStatus[a.status] ?? "slate"} /></td><td><PsychometricStatusBadge label={o?.payment_status ?? "unknown"} tone={o?.payment_status === "paid" ? "emerald" : o?.payment_status === "failed" ? "rose" : "amber"} /></td><td>{a.total_score ?? 0} ({a.percentage_score ?? 0}%)</td><td>{a.result_band ?? "—"}</td><td>{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</td><td>{a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</td><td className="space-x-2 whitespace-nowrap"><Link href={`/admin/psychometric/attempts/${a.id}`} className="underline">View Attempt</Link>{a.report_id ? <Link href={`/admin/psychometric/reports/${a.report_id}`} className="underline">View Report</Link> : null}{a.status === "completed" ? <form className="inline" action={`/api/admin/psychometric/reports/${a.id}/regenerate`} method="post"><button className="underline">Regenerate Report</button></form> : null}</td></tr>;
      })}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{filtered.map((a: any) => {
        const p = userMap.get(a.user_id); const t = testMap.get(a.test_id); const o = orderMap.get(a.order_id);
        return <PsychometricAdminCard key={a.id}><div className="space-y-2 text-sm"><div><p className="font-medium break-words">{p?.full_name ?? "Unknown Student"}</p><p className="text-xs text-slate-500 break-all">{p?.email ?? "—"}</p></div><p className="text-sm font-medium break-words">{t?.title ?? "Unknown test"}</p><div className="flex flex-wrap gap-2"><PsychometricStatusBadge label={a.status ?? "unknown"} tone={toneByStatus[a.status] ?? "slate"} /><PsychometricStatusBadge label={o?.payment_status ?? "unknown"} tone={o?.payment_status === "paid" ? "emerald" : o?.payment_status === "failed" ? "rose" : "amber"} /></div><p>Score: {a.total_score ?? 0} ({a.percentage_score ?? 0}%)</p><p>Created: {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</p><p>Completed: {a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</p><div className="flex flex-wrap gap-3"><Link href={`/admin/psychometric/attempts/${a.id}`} className="underline">View Attempt</Link>{a.report_id ? <Link href={`/admin/psychometric/reports/${a.report_id}`} className="underline">View Report</Link> : null}{a.status === "completed" ? <form action={`/api/admin/psychometric/reports/${a.id}/regenerate`} method="post"><button className="underline">Regenerate Report</button></form> : null}</div></div></PsychometricAdminCard>;
      })}</div>
    </>}
  </div>;
}
