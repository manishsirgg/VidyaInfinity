import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

type TestRef = { title: string | null; slug: string | null };
type OrderRow = { id: string; payment_status: string | null; final_amount: number | null; final_paid_amount: number | null; paid_at: string | null; created_at: string; attempt_id: string | null; psychometric_tests: TestRef[] | TestRef | null };
type AttemptRow = { id: string; status: string | null; report_id: string | null };

const isPaid = (s: string | null, p: string | null) => ["paid", "success", "captured", "confirmed"].includes(String(s ?? "").toLowerCase()) || Boolean(p);

export default async function Page() {
  const { profile } = await requireUser("student");
  const supabase = await createClient();
  const { data: orders } = await supabase.from("psychometric_orders").select("id,payment_status,final_amount,final_paid_amount,paid_at,created_at,attempt_id,psychometric_tests(title,slug)").eq("user_id", profile.id).order("created_at", { ascending: false }).returns<OrderRow[]>();
  const attemptIds = (orders ?? []).map((o) => o.attempt_id).filter((v): v is string => Boolean(v));
  const { data: attempts } = attemptIds.length ? await supabase.from("test_attempts").select("id,status,report_id").in("id", attemptIds).returns<AttemptRow[]>() : { data: [] as AttemptRow[] };
  const at = new Map((attempts ?? []).map((a) => [a.id, a]));

  return <div className="mx-auto max-w-6xl px-4 py-10"><h1 className="mb-5 text-2xl font-semibold">Psychometric Dashboard</h1><div className="grid gap-4">{(orders ?? []).map((o) => { const a = o.attempt_id ? at.get(o.attempt_id) : null; const paid = isPaid(o.payment_status, o.paid_at); const testRef = Array.isArray(o.psychometric_tests) ? o.psychometric_tests[0] : o.psychometric_tests; const slug = testRef?.slug ?? null; return <div key={o.id} className="rounded-xl border bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="font-semibold">{testRef?.title ?? "Psychometric Test"}</h2><p className="text-sm text-slate-600">{!paid ? String(o.payment_status).includes("fail") ? "Payment failed" : "Payment pending" : a?.status === "in_progress" ? "In progress" : a?.status === "completed" ? "Completed / Report Ready" : "Paid / Not started"}</p></div><p className="text-sm">₹{o.final_paid_amount ?? o.final_amount ?? 0}</p></div><div className="mt-3 flex flex-wrap gap-2">{!paid && slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Retry Payment</Link> : null}{paid && a?.status === "in_progress" ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Continue Test</Link> : null}{paid && (!a || ["not_started", "unlocked"].includes(String(a.status))) ? (a ? <Link href={`/dashboard/psychometric/attempts/${a.id}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start Test</Link> : slug ? <Link href={`/psychometric-tests/${slug}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Start Test</Link> : null) : null}{a?.report_id ? <Link href={`/dashboard/psychometric/reports/${a.report_id}`} className="rounded border px-3 py-2 text-sm">View Report</Link> : null}{a?.report_id ? <a href={`/api/psychometric/reports/${a.report_id}/download`} className="rounded border px-3 py-2 text-sm">Download Report</a> : null}</div></div>; })}</div></div>;
}
