import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PsychometricDiagnosticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,email").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [orders, attempts, answers, reports] = await Promise.all([
    supabase.from("psychometric_orders").select("id,payment_status,attempt_id,created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("test_attempts").select("id,order_id,status,created_at,completed_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("psychometric_answers").select("id,attempt_id,question_id,awarded_score,created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("psychometric_reports").select("id,attempt_id,total_score,max_score,created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Psychometric Diagnostics</h1><p className="text-sm text-slate-600">Admin: {profile?.email}</p>
    <div className="flex gap-3"><form action="/api/admin/psychometric/reconcile" method="post"><button className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Run Reconcile</button></form><form action="/api/admin/psychometric/reports/regenerate-broken" method="post"><button className="rounded border px-3 py-2 text-sm">Regenerate stale reports</button></form></div>
    <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">If reconcile returns all zeros, system is already consistent. No repairs were needed.</p>
    {[['Orders',orders.data],['Attempts',attempts.data],['Answers',answers.data],['Reports',reports.data]].map(([label,data])=><section key={String(label)}><h2 className="mb-2 font-medium">{String(label)}</h2><pre className="overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(data??[],null,2)}</pre></section>)}
  </div>;
}
