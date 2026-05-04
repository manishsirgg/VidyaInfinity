"use client";
import { useEffect, useMemo, useState } from "react";

type Tab = "issues" | "audit";
type Row = Record<string, unknown> & { id?: string; issue?: string; auditStatus?: string; canReconcile?: boolean; orderId?: string; orderType?: string; featureType?: string; subscriptionId?: string | null; subscriptionStatus?: string | null; planCode?: string | null; amount?: number | null; paymentStatus?: string | null; orderStatus?: string | null; instituteId?: string | null; targetId?: string | null; razorpayOrderId?: string | null; razorpayPaymentId?: string | null; createdAt?: string | null; paidAt?: string | null; recommendedAction?: string | null; };
const REC_ISSUES = ["paid_missing_subscription", "paid_featured_order_missing_subscription", "course_upgrade_paid_but_scheduled", "webinar_upgrade_paid_but_scheduled", "paid_upgrade_scheduled_while_lower_active"];

export function FeaturedReconciliationPanel() {
  const [tab, setTab] = useState<Tab>("issues"); const [issues, setIssues] = useState<Row[]>([]); const [auditRows, setAuditRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{type:"ok"|"err"; msg:string}|null>(null); const [busyId, setBusyId] = useState<string | null>(null);
  async function fetchData() { setLoading(true); const res = await fetch("/api/admin/featured-reconciliation", { cache: "no-store" }); const body = await res.json(); setIssues(body.issues ?? []); setAuditRows(body.auditRows ?? []); setLoading(false); }
  useEffect(() => { void fetchData(); }, []);
  const rows = useMemo(() => tab === "issues" ? issues : auditRows, [tab, issues, auditRows]);
  async function reconcile(row: Row) {
    console.log("[featured-reconciliation] reconcile row", row);
    const payload = { orderType: row.orderType || row.featureType, orderId: row.orderId };
    console.log("[featured-reconciliation] reconcile payload", payload);
    setBusyId(String(row.id ?? row.orderId));
    const res = await fetch("/api/admin/featured-reconciliation/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json(); console.log("[featured-reconciliation] reconcile response", body);
    if (body.success) { setStatus({type:"ok", msg: body.message ?? "Reconciliation completed."}); setIssues((prev)=>prev.filter((x)=>String(x.id)!==String(row.id))); await fetchData(); }
    else setStatus({type:"err", msg: [body.message, body.error, body.debug_stage].filter(Boolean).join(" | ")});
    setBusyId(null);
  }
  return <div className="mt-6 space-y-3">{status && <div className={`rounded border px-3 py-2 text-sm ${status.type==="ok"?"border-emerald-300 bg-emerald-50 text-emerald-900":"border-red-300 bg-red-50 text-red-900"}`}>{status.msg}</div>}
    <div className="flex flex-wrap gap-2"><button className={`rounded px-3 py-1 ${tab==="issues"?"bg-blue-600 text-white":"bg-slate-200"}`} onClick={()=>setTab("issues")}>Issues Needing Action</button><button className={`rounded px-3 py-1 ${tab==="audit"?"bg-blue-600 text-white":"bg-slate-200"}`} onClick={()=>setTab("audit")}>All Featured Payment Audit</button></div>
    {loading ? <div>Loading…</div> : <div className="space-y-3">{rows.map((r)=>{const issue=String(r.issue ?? r.auditStatus ?? "review"); const canRec=r.canReconcile===true && !!r.orderId && REC_ISSUES.includes(issue); const busy=busyId===String(r.id ?? r.orderId); return <div key={String(r.id ?? r.orderId)} className="rounded border bg-white p-3 text-xs md:text-sm"><div className="grid grid-cols-1 gap-2 md:grid-cols-4"><div><b>Status:</b> {issue}</div><div><b>Type:</b> {String(r.orderType ?? r.featureType ?? "-")}</div><div><b>Plan:</b> {String(r.planCode ?? "-")} | ₹{Number(r.amount ?? 0).toLocaleString("en-IN")}</div><div><b>Payment/Order:</b> {String(r.paymentStatus ?? "unknown")} / {String(r.orderStatus ?? "-")}</div><div><b>Order:</b> {String(r.orderId ?? "-")}</div><div><b>Subscription:</b> {r.subscriptionId ? `${r.subscriptionId} (${r.subscriptionStatus ?? "-"})` : "missing"}</div><div><b>Razorpay O/P:</b> {String(r.razorpayOrderId ?? "-")} / {String(r.razorpayPaymentId ?? "-")}</div><div><b>Target:</b> {String(r.instituteId ?? "-")} / {String(r.targetId ?? "-")}</div></div><details className="mt-2"><summary className="cursor-pointer text-blue-700">View details payload</summary><pre className="mt-2 overflow-auto rounded bg-slate-100 p-2">{JSON.stringify(r,null,2)}</pre></details><div className="mt-2 flex items-center gap-2"><button disabled={!canRec || busy} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>reconcile(r)}>{busy?"Reconciling...":"Reconcile"}</button>{!canRec && <span className="text-amber-700">Manual review required or not eligible for auto reconcile.</span>}</div></div>;})}</div>}
  </div>;
}
