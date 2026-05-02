"use client";

import { useEffect, useState } from "react";

type OrderType = "institute" | "course" | "webinar";

type ReconciliationOrder = {
  id: string;
  orderId: string;
  orderType: OrderType;
  targetId: string | null;
  instituteId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  plan_id: string | null;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  order_status: string | null;
  created_at: string;
  paid_at: string | null;
  course_id?: string | null;
  webinar_id?: string | null;
  missing_subscription?: boolean;
};

type Row = ReconciliationOrder & {
  issue: string;
  recommendedAction: string;
};

function badgeClass(value: string) {
  const v = value.toLowerCase();
  if (v.includes("paid") || v.includes("active") || v.includes("success")) return "bg-emerald-100 text-emerald-800";
  if (v.includes("fail") || v.includes("missing") || v.includes("mismatch")) return "bg-rose-100 text-rose-800";
  if (v.includes("pending") || v.includes("recon")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

const ISSUE_OPTIONS = ["all", "pending_over_10m", "paid_needs_reconciliation", "failed_payment", "active_mismatch", "duplicate_active"] as const;

export function FeaturedReconciliationPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [filters, setFilters] = useState({ orderType: "all", issueType: "all", paymentStatus: "all", orderStatus: "all", instituteSearch: "", razorpaySearch: "" });
  const [modal, setModal] = useState<{ kind: "manual" | "cancel" | "extend" | "details"; row: Row } | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  const [subscriptionId, setSubscriptionId] = useState("");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/featured-reconciliation", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to fetch reconciliation data.");
      const now = Date.now();
      const mapRows = (orders: ReconciliationOrder[], orderType: OrderType) =>
        orders.map((order) => {
          const createdMs = new Date(order.created_at).getTime();
          const isPending = (order.payment_status ?? "").toLowerCase().includes("pending");
          const isPaid = (order.payment_status ?? "").toLowerCase().includes("paid");
          const isFailed = (order.payment_status ?? "").toLowerCase().includes("fail");
          const pendingOver10m = isPending && now - createdMs > 10 * 60_000;
          let issue = "active_mismatch";
          let recommendedAction = "Review details";
          if (pendingOver10m) {
            issue = "pending_over_10m";
            recommendedAction = "Reconcile with Razorpay";
          } else if (isPaid && orderType === "institute" && order.missing_subscription) {
            issue = "paid_needs_reconciliation";
            recommendedAction = "Create missing active subscription";
          } else if (isPaid) {
            issue = "paid_needs_reconciliation";
            recommendedAction = "Reconcile or manual correction";
          } else if (isFailed) {
            issue = "failed_payment";
            recommendedAction = "Cancel / review";
          }
          return { ...order, orderType, issue, recommendedAction };
        });
      setRows([...(mapRows(body.instituteOrders ?? [], "institute")), ...(mapRows(body.courseOrders ?? [], "course")), ...(mapRows(body.webinarOrders ?? [], "webinar"))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchData(); }, []);

  const visibleRows = rows.filter((row) => {
    if (filters.orderType !== "all" && row.orderType !== filters.orderType) return false;
    if (filters.issueType !== "all" && row.issue !== filters.issueType) return false;
    if (filters.paymentStatus !== "all" && row.payment_status !== filters.paymentStatus) return false;
    if (filters.orderStatus !== "all" && row.order_status !== filters.orderStatus) return false;
    if (filters.instituteSearch && !(row.instituteId ?? "").toLowerCase().includes(filters.instituteSearch.toLowerCase())) return false;
    if (filters.razorpaySearch && !(`${row.razorpayOrderId ?? ""} ${row.razorpayPaymentId ?? ""}`).toLowerCase().includes(filters.razorpaySearch.toLowerCase())) return false;
    return true;
  });

  async function runAction(path: string, payload: Record<string, unknown>, successText: string, id: string) {
    setRunningActionId(id);
    setToast(null);
    try {
            const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) {
        console.error("[featured-reconciliation] action_failed", { path, payload, status: response.status, body });
        const errorText = [body?.message, body?.error, body?.debug_stage ? `stage: ${body.debug_stage}` : null].filter(Boolean).join(" | ");
        throw new Error(errorText || "Action failed.");
      }
      setToast({ type: "success", text: body?.message ?? successText });
      setModal(null);
      setReason("");
      setSubscriptionId("");
      try {
        await fetchData();
      } catch {
        setToast({ type: "success", text: "Reconciliation completed. Please refresh." });
      }
    } catch (e) {
      setToast({ type: "error", text: e instanceof Error ? e.message : "Unexpected error" });
    } finally { setRunningActionId(null); }
  }

  return <div className="mt-6 space-y-4">
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Manual actions should only be used for verified payment recovery, complimentary grants, or technical correction. Every action is logged.</div>
    <div className="grid gap-2 rounded border bg-white p-3 text-sm md:grid-cols-4">
      <select className="rounded border p-2" value={filters.orderType} onChange={(e) => setFilters((p) => ({ ...p, orderType: e.target.value }))}><option value="all">All types</option><option value="institute">Institute</option><option value="course">Course</option><option value="webinar">Webinar</option></select>
      <select className="rounded border p-2" value={filters.issueType} onChange={(e) => setFilters((p) => ({ ...p, issueType: e.target.value }))}>{ISSUE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
      <input className="rounded border p-2" placeholder="Institute search" value={filters.instituteSearch} onChange={(e) => setFilters((p) => ({ ...p, instituteSearch: e.target.value }))} />
      <input className="rounded border p-2" placeholder="Razorpay Order/Payment" value={filters.razorpaySearch} onChange={(e) => setFilters((p) => ({ ...p, razorpaySearch: e.target.value }))} />
    </div>
    {loading ? <div className="rounded border bg-white p-8 text-center">Loading reconciliation issues...</div> : null}
    {error ? <div className="rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error} <button className="ml-2 underline" onClick={fetchData}>Retry</button></div> : null}
    {!loading && !error && visibleRows.length === 0 ? <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-slate-600">No featured reconciliation issues found.</div> : null}
    {!loading && !error && visibleRows.length > 0 ? <div className="overflow-x-auto rounded border bg-white"><table className="min-w-[1400px] w-full text-xs"><thead><tr className="bg-slate-50 text-left">{["Issue","Type","Institute","Item","Plan","Amount","Local Payment","Local Order","Subscription","Razorpay Order ID","Razorpay Payment ID","Created","Paid","Recommended Action","Actions"].map((h)=><th key={h} className="px-2 py-2">{h}</th>)}</tr></thead><tbody>{visibleRows.map((row)=><tr key={`${row.orderType}-${row.orderId}`} className="border-t"><td className="px-2 py-2"><span className={`rounded px-2 py-1 ${badgeClass(row.issue)}`}>{row.issue}</span></td><td className="px-2 py-2">{row.orderType}</td><td className="px-2 py-2">{row.instituteId ?? "-"}</td><td className="px-2 py-2">{row.targetId ?? "-"}</td><td className="px-2 py-2">{row.plan_id ?? "-"}</td><td className="px-2 py-2">₹{Number(row.amount ?? 0).toLocaleString("en-IN")}</td><td className="px-2 py-2"><span className={`rounded px-2 py-1 ${badgeClass(row.payment_status ?? "unknown")}`}>{row.payment_status ?? "unknown"}</span></td><td className="px-2 py-2">{row.order_status ?? "-"}</td><td className="px-2 py-2"><span className={`rounded px-2 py-1 ${badgeClass(row.issue.includes("paid") ? "missing subscription" : "active")}`}>{row.issue.includes("paid") ? "missing subscription" : "active"}</span></td><td className="px-2 py-2">{row.razorpayOrderId ?? "-"}</td><td className="px-2 py-2">{row.razorpayPaymentId ?? "-"}</td><td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td><td className="px-2 py-2">{row.paid_at ? new Date(row.paid_at).toLocaleString() : "-"}</td><td className="px-2 py-2">{row.recommendedAction}</td><td className="px-2 py-2"><div className="flex flex-wrap gap-1"> <button disabled={runningActionId!==null || (!row.razorpayOrderId && row.orderType !== "institute")} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>{ const payload={orderType:row.orderType,orderId:row.orderId}; console.log('[featured-reconciliation] reconcile row', row); console.log('[featured-reconciliation] reconcile payload', payload); runAction('/api/admin/featured-reconciliation/reconcile',payload,'Reconciled successfully',row.orderId); }}>Reconcile</button><button disabled={runningActionId!==null} className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>setModal({kind:'manual',row})}>Manual Feature</button><button disabled={runningActionId!==null} className="rounded bg-rose-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>setModal({kind:'cancel',row})}>Cancel</button><button disabled={runningActionId!==null} className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>setModal({kind:'extend',row})}>Extend</button><button disabled={runningActionId!==null} className="rounded bg-slate-600 px-2 py-1 text-white disabled:opacity-50" onClick={()=>setModal({kind:'details',row})}>Details</button></div></td></tr>)}</tbody></table></div> : null}
    {modal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-lg rounded bg-white p-4">
      <h3 className="text-lg font-semibold">{modal.kind === "manual" ? "Manual Feature / Complimentary Grant" : modal.kind === "cancel" ? "Cancel Feature" : modal.kind === "extend" ? "Extend Feature" : "Details"}</h3>
      {modal.kind === "details" ? <pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-100 p-3 text-xs">{JSON.stringify({ ...modal.row, details: { localOrderId: modal.row.orderId, targetId: modal.row.targetId, instituteId: modal.row.instituteId } }, null, 2)}</pre> : <>
      <p className="mt-2 text-xs text-slate-600">Reason is mandatory and logged for auditing.</p>
      <textarea value={reason} onChange={(e)=>setReason(e.target.value)} className="mt-2 min-h-24 w-full rounded border p-2 text-sm" placeholder="Admin reason" />
      {(modal.kind === "cancel" || modal.kind === "extend") ? <input value={subscriptionId} onChange={(e)=>setSubscriptionId(e.target.value)} className="mt-2 w-full rounded border p-2 text-sm" placeholder="Subscription ID" /> : null}
      {modal.kind === "extend" ? <input value={days} onChange={(e)=>setDays(e.target.value)} className="mt-2 w-full rounded border p-2 text-sm" placeholder="Days to extend" type="number" min={1} /> : null}
      </>}
      <div className="mt-4 flex justify-end gap-2"><button className="rounded border px-3 py-1" onClick={()=>setModal(null)}>Close</button>
      {modal.kind === "manual" ? <button disabled={!reason.trim() || runningActionId!==null} className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-50" onClick={()=>runAction('/api/admin/featured-reconciliation/manual-feature',{orderType:modal.row.orderType,orderId:modal.row.orderId,reason},'Manual feature action completed',modal.row.orderId)}>Submit</button> : null}
      {modal.kind === "cancel" ? <button disabled={!reason.trim() || !subscriptionId.trim() || runningActionId!==null} className="rounded bg-rose-600 px-3 py-1 text-white disabled:opacity-50" onClick={()=>runAction('/api/admin/featured-reconciliation/cancel',{orderType:modal.row.orderType,subscriptionId,reason},'Subscription cancelled',modal.row.orderId)}>Submit</button> : null}
      {modal.kind === "extend" ? <button disabled={!reason.trim() || !subscriptionId.trim() || Number(days)<=0 || runningActionId!==null} className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-50" onClick={()=>runAction('/api/admin/featured-reconciliation/extend',{orderType:modal.row.orderType,subscriptionId,reason,days:Number(days)},'Subscription extended',modal.row.orderId)}>Submit</button> : null}
      </div></div></div> : null}
    {toast ? <div className={`fixed bottom-5 right-5 rounded border px-3 py-2 text-sm ${toast.type==='success'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-rose-200 bg-rose-50 text-rose-800'}`}>{toast.text}</div> : null}
  </div>;
}
