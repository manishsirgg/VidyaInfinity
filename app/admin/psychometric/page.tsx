import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPsychometricDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const [tests, activeTests, orders, attemptsStarted, completedAttempts, reports] = await Promise.all([
    supabase.from("psychometric_tests").select("id", { count: "exact", head: true }),
    supabase.from("psychometric_tests").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("psychometric_orders").select("id", { count: "exact", head: true }).in("payment_status", ["paid", "captured"]),
    supabase.from("test_attempts").select("id", { count: "exact", head: true }).in("status", ["unlocked", "in_progress", "completed"]),
    supabase.from("test_attempts").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("psychometric_reports").select("id", { count: "exact", head: true }),
  ]);

  const cards = [
    ["Total tests", tests.count ?? 0], ["Active tests", activeTests.count ?? 0], ["Paid orders", orders.count ?? 0],
    ["Attempts started", attemptsStarted.count ?? 0], ["Completed attempts", completedAttempts.count ?? 0], ["Reports generated", reports.count ?? 0],
  ];

  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Psychometric Management</h1><p className="text-sm text-slate-600">Enterprise admin console.</p></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
    ["Create New Test","/admin/psychometric/tests/new"],["Manage Tests","/admin/psychometric/tests"],["View Attempts","/admin/psychometric/attempts"],["View Reports","/admin/psychometric/reports"],["Diagnostics","/admin/psychometric/diagnostics"]
  ].map(([l,href])=><Link key={String(l)} href={String(href)} className="rounded-lg border bg-white p-3 text-sm font-medium hover:border-brand-300">{l}</Link>)}<form action="/api/admin/psychometric/reconcile" method="post"><button className="w-full rounded-lg bg-brand-600 p-3 text-sm font-medium text-white">Run Reconcile</button></form></div></div>;
}
