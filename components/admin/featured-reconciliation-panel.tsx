"use client";
import { useEffect, useMemo, useState } from "react";

type Tab = "issues" | "audit";
type Row = Record<string, unknown> & { id?: string; issue?: string; auditStatus?: string; canReconcile?: boolean; orderId?: string; orderType?: string; featureType?: string; subscriptionId?: string | null; subscriptionStatus?: string | null; planCode?: string | null; amount?: number | null; paymentStatus?: string | null; orderStatus?: string | null; instituteId?: string | null; targetId?: string | null; razorpayOrderId?: string | null; razorpayPaymentId?: string | null; createdAt?: string | null; paidAt?: string | null; recommendedAction?: string | null; };

const REC_ISSUES = ["paid_missing_subscription", "course_upgrade_paid_but_scheduled", "webinar_upgrade_paid_but_scheduled", "paid_upgrade_scheduled_while_lower_active"];

export function FeaturedReconciliationPanel() {
  const [tab, setTab] = useState<Tab>("issues");
  const [issues, setIssues] = useState<Row[]>([]);
  const [auditRows, setAuditRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ featureType: "all", auditStatus: "all", paymentStatus: "all", orderStatus: "all" });

  async function fetchData() {
    setLoading(true);
    const res = await fetch("/api/admin/featured-reconciliation", { cache: "no-store" });
    const body = await res.json();
    setIssues(body.issues ?? []);
    setAuditRows(body.auditRows ?? []);
    setLoading(false);
  }
  useEffect(() => { void fetchData(); }, []);

  const rows = useMemo(() => (tab === "issues" ? issues : auditRows).filter((r) => {
    if (f.featureType !== "all" && r.featureType !== f.featureType) return false;
    if (f.auditStatus !== "all" && (r.auditStatus ?? r.issue) !== f.auditStatus) return false;
    if (f.paymentStatus !== "all" && r.paymentStatus !== f.paymentStatus) return false;
    if (f.orderStatus !== "all" && r.orderStatus !== f.orderStatus) return false;
    if (q && !(`${r.orderId ?? ""} ${r.razorpayOrderId ?? ""} ${r.razorpayPaymentId ?? ""} ${r.instituteId ?? ""} ${r.targetId ?? ""}`).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [tab, issues, auditRows, f, q]);

  async function reconcile(row: Row) {
    await fetch("/api/admin/featured-reconciliation/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderType: row.orderType ?? row.featureType, orderId: row.orderId }) });
    await fetchData();
  }

  return <div className="mt-6 space-y-3">
    <div className="flex gap-2"><button className={`rounded px-3 py-1 ${tab==="issues"?"bg-blue-600 text-white":"bg-slate-200"}`} onClick={()=>setTab("issues")}>Issues Needing Action</button><button className={`rounded px-3 py-1 ${tab==="audit"?"bg-blue-600 text-white":"bg-slate-200"}`} onClick={()=>setTab("audit")}>All Featured Payment Audit</button></div>
    <div className="grid gap-2 md:grid-cols-5"><select className="rounded border p-2" value={f.featureType} onChange={(e)=>setF((p)=>({...p,featureType:e.target.value}))}><option value="all">All types</option><option value="institute">Institute</option><option value="course">Course</option><option value="webinar">Webinar</option></select><input className="rounded border p-2" placeholder="Search order/razorpay/institute/target" value={q} onChange={(e)=>setQ(e.target.value)} /><select className="rounded border p-2" value={f.auditStatus} onChange={(e)=>setF((p)=>({...p,auditStatus:e.target.value}))}><option value="all">All statuses</option>{[...new Set((auditRows).map((r)=>String(r.auditStatus ?? r.issue)).filter(Boolean))].map((s)=><option key={s} value={s}>{s}</option>)}</select><select className="rounded border p-2" value={f.paymentStatus} onChange={(e)=>setF((p)=>({...p,paymentStatus:e.target.value}))}><option value="all">All payment</option>{[...new Set(auditRows.map((r)=>String(r.paymentStatus)).filter(Boolean))].map((s)=><option key={s} value={s}>{s}</option>)}</select><select className="rounded border p-2" value={f.orderStatus} onChange={(e)=>setF((p)=>({...p,orderStatus:e.target.value}))}><option value="all">All order</option>{[...new Set(auditRows.map((r)=>String(r.orderStatus)).filter(Boolean))].map((s)=><option key={s} value={s}>{s}</option>)}</select></div>
    {loading ? <div>Loading…</div> : <div className="overflow-x-auto rounded border bg-white"><table className="min-w-[1800px] w-full text-xs"><thead><tr>{["Issue/Audit Status","Type","Institute","Target/Item","Plan","Amount","Local Payment","Local Order","Subscription","Razorpay Order ID","Razorpay Payment ID","Created","Paid","Recommended Action","Actions"].map((h)=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((r)=>{const issue = r.issue ?? r.auditStatus; const canReconcile = r.canReconcile===true && !!r.orderId && REC_ISSUES.includes(String(issue)); return <tr key={r.id ?? `${r.orderId}-${r.subscriptionId ?? "none"}`} className="border-t"><td className="px-2 py-2">{issue}</td><td className="px-2 py-2">{r.featureType}</td><td className="px-2 py-2">{r.instituteId ?? "-"}</td><td className="px-2 py-2">{r.targetId ?? "-"}</td><td className="px-2 py-2">{r.planCode ?? "-"}</td><td className="px-2 py-2">₹{Number(r.amount ?? 0).toLocaleString("en-IN")}</td><td className="px-2 py-2">{r.paymentStatus ?? "unknown"}</td><td className="px-2 py-2">{r.orderStatus ?? "-"}</td><td className="px-2 py-2">{r.subscriptionId ? `${r.subscriptionId} (${r.subscriptionStatus ?? "-"})` : "missing"}</td><td className="px-2 py-2">{r.razorpayOrderId ?? "-"}</td><td className="px-2 py-2">{r.razorpayPaymentId ?? "-"}</td><td className="px-2 py-2">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td><td className="px-2 py-2">{r.paidAt ? new Date(r.paidAt).toLocaleString() : "-"}</td><td className="px-2 py-2">{r.recommendedAction ?? "-"}</td><td className="px-2 py-2"><button disabled={!canReconcile} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>reconcile(r)}>Reconcile</button></td></tr>;})}</tbody></table></div>}
  </div>;
}
