import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PsychometricAdminCard, PsychometricAdminHeader, PsychometricAdminSubnav } from "./_components/AdminPsychometricUI";

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

  const cards = [["Total Tests", tests.count ?? 0], ["Active Tests", activeTests.count ?? 0], ["Paid Orders", orders.count ?? 0], ["Attempts Started", attemptsStarted.count ?? 0], ["Completed Attempts", completedAttempts.count ?? 0], ["Reports Generated", reports.count ?? 0], ["Broken/Stale Reports", 0]];

  return <div className="space-y-6 bg-slate-50/60 p-3 pb-10 md:p-6"><PsychometricAdminHeader title="Psychometric Management" description="Manage assessments, scoring, attempts, reports, and diagnostics from one place." breadcrumbs={[{label:"Admin",href:"/admin/dashboard"},{label:"Psychometric"}]}/><PsychometricAdminSubnav currentPath="/admin/psychometric"/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <PsychometricAdminCard key={String(label)}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p></PsychometricAdminCard>)}</div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[["Create Psychometric Test","/admin/psychometric/tests/new"],["Manage Tests","/admin/psychometric/tests"],["Manage Questions","/admin/psychometric/tests"],["Review Attempts","/admin/psychometric/attempts"],["Reports & Scoring","/admin/psychometric/reports"],["Diagnostics & Repairs","/admin/psychometric/diagnostics"]].map(([l,href])=><Link key={String(l)} href={String(href)} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow">{l}</Link>)}</div></div>;
}
