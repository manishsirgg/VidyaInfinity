import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page(){
  const { profile } = await requireUser("admin");
  const supabase = await createClient();
  const [orders, attempts, reports] = await Promise.all([
    supabase.from("psychometric_orders").select("id,user_id,payment_status,attempt_id,created_at").order("created_at",{ascending:false}).limit(30),
    supabase.from("test_attempts").select("id,user_id,status,report_id,created_at").order("created_at",{ascending:false}).limit(30),
    supabase.from("psychometric_reports").select("id,user_id,attempt_id,created_at").order("created_at",{ascending:false}).limit(30),
  ]);
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Psychometric Diagnostics</h1><p className="text-sm text-slate-600">Admin: {profile.email}</p><form action="/api/admin/psychometric/reconcile" method="post"><button className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Run reconcile</button></form><section><h2 className="mb-2 font-medium">Orders</h2><pre className="overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(orders.data??[],null,2)}</pre></section><section><h2 className="mb-2 font-medium">Attempts</h2><pre className="overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(attempts.data??[],null,2)}</pre></section><section><h2 className="mb-2 font-medium">Reports</h2><pre className="overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(reports.data??[],null,2)}</pre></section></div>;
}
