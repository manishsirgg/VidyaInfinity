"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RefundDbStatus = "requested" | "processing" | "refunded" | "failed" | "cancelled";

type RefundRow = {
  id: string;
  user_id: string | null;
  order_kind: "course_enrollment" | "psychometric_test" | "webinar" | "webinar_registration";
  course_order_id: string | null;
  psychometric_order_id: string | null;
  webinar_order_id: string | null;
  reason: string | null;
  internal_notes: string | null;
  refund_status: RefundDbStatus;
  requested_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  order: {
    id: string;
    final_paid_amount: number | null;
    currency: string | null;
    payment_status: string;
    paid_at: string | null;
  } | null;
};

const STATUS_TRANSITIONS: Record<RefundDbStatus, RefundDbStatus[]> = {
  requested: ["processing", "cancelled"],
  processing: [],
  refunded: [],
  failed: [],
  cancelled: [],
};

const UI_STATUS_META: Record<RefundDbStatus, { label: string; badgeClass: string }> = {
  requested: { label: "Requested", badgeClass: "bg-amber-100 text-amber-800" },
  processing: { label: "Processing", badgeClass: "bg-blue-100 text-blue-800" },
  refunded: { label: "Refunded", badgeClass: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", badgeClass: "bg-rose-100 text-rose-800" },
  failed: { label: "Failed", badgeClass: "bg-orange-100 text-orange-800" },
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount === null) return "-";
  const safeCurrency = currency || "INR";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function refundKindLabel(kind: RefundRow["order_kind"]) {
  if (kind === "course_enrollment") return "Course";
  if (kind === "psychometric_test") return "Psychometric";
  return "Webinar";
}

export function AdminRefundsManagement({ initialRefunds }: { initialRefunds: RefundRow[] }) {
  const router = useRouter();
  const [refunds, setRefunds] = useState(initialRefunds);
  const [statusFilter, setStatusFilter] = useState<RefundDbStatus | "all">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingActionByRefundId, setPendingActionByRefundId] = useState<Record<string, RefundDbStatus | null>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRefunds.map((refund) => [refund.id, refund.internal_notes ?? ""])),
  );

  const counts = useMemo(() => {
    return refunds.reduce(
      (acc, refund) => {
        acc[refund.refund_status] += 1;
        return acc;
      },
      { requested: 0, processing: 0, cancelled: 0, refunded: 0, failed: 0 },
    );
  }, [refunds]);

  const visibleRefunds = useMemo(() => {
    if (statusFilter === "all") return refunds;
    return refunds.filter((refund) => refund.refund_status === statusFilter);
  }, [refunds, statusFilter]);

  async function updateRefund(refundId: string, nextStatus: RefundDbStatus) {
    if (loadingId) return;
    setLoadingId(refundId);
    setPendingActionByRefundId((prev) => ({ ...prev, [refundId]: nextStatus }));
    setToast(null);

    try {
      const response = await fetch(`/api/admin/refunds/${refundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, adminNote: draftNotes[refundId]?.trim() || null }),
      });

      const body = await response.json();
      if (!response.ok) {
        setToast({ type: "error", text: body?.error ?? "Unable to update refund." });
        return;
      }

      setRefunds((prev) =>
        prev.map((refund) =>
          refund.id === refundId
            ? {
                ...refund,
                refund_status: (body.refund?.refund_status as RefundDbStatus) ?? nextStatus,
                internal_notes: draftNotes[refundId]?.trim() || null,
                processed_at:
                  body.refund?.refund_status === "refunded" || body.refund?.refund_status === "processing"
                    ? new Date().toISOString()
                    : refund.processed_at,
                order:
                  body.refund?.refund_status === "refunded" && refund.order
                    ? {
                        ...refund.order,
                        payment_status: "refunded",
                      }
                    : refund.order,
              }
            : refund,
        ),
      );

      setToast({
        type: "success",
        text: body?.message ?? `Refund ${refundId.slice(0, 8)} updated to ${UI_STATUS_META[nextStatus].label}.`,
      });
      router.refresh();
    } catch (error) {
      setToast({
        type: "error",
        text: error instanceof Error ? error.message : "Unexpected error while updating refund.",
      });
    } finally {
      setLoadingId(null);
      setPendingActionByRefundId((prev) => ({ ...prev, [refundId]: null }));
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 rounded border bg-white p-4 text-sm sm:grid-cols-6">
        <div className="rounded border p-3"><p className="text-slate-500">Total</p><p className="text-lg font-semibold">{refunds.length}</p></div>
        <div className="rounded border p-3"><p className="text-slate-500">Requested</p><p className="text-lg font-semibold text-amber-700">{counts.requested}</p></div>
        <div className="rounded border p-3"><p className="text-slate-500">Processing</p><p className="text-lg font-semibold text-blue-700">{counts.processing}</p></div>
        <div className="rounded border p-3"><p className="text-slate-500">Refunded</p><p className="text-lg font-semibold text-emerald-700">{counts.refunded}</p></div>
        <div className="rounded border p-3"><p className="text-slate-500">Cancelled</p><p className="text-lg font-semibold text-rose-700">{counts.cancelled}</p></div>
        <div className="rounded border p-3"><p className="text-slate-500">Failed</p><p className="text-lg font-semibold text-orange-700">{counts.failed}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-3 text-sm">
        <span className="font-medium text-slate-700">Filter:</span>
        {(["all", "requested", "processing", "refunded", "cancelled", "failed"] as const).map((item) => (
          <button key={item} type="button" className={`rounded px-3 py-1 ${statusFilter === item ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setStatusFilter(item as RefundDbStatus | "all")}>{item[0]?.toUpperCase()}{item.slice(1)}</button>
        ))}
      </div>

      {visibleRefunds.length === 0 ? (
        <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-slate-600">No refunds found for the selected filter.</div>
      ) : (
        <div className="space-y-3">
          {visibleRefunds.map((refund) => {
            const availableTransitions = STATUS_TRANSITIONS[refund.refund_status];
            const orderId = refund.order_kind === "course_enrollment" ? refund.course_order_id : refund.order_kind === "psychometric_test" ? refund.psychometric_order_id : refund.webinar_order_id;

            return (
              <div key={refund.id} className="rounded border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{refundKindLabel(refund.order_kind)} refund · {refund.id.slice(0, 8)}</p>
                    <p className="text-xs text-slate-500">Requested {new Date(refund.requested_at).toLocaleString()}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${UI_STATUS_META[refund.refund_status].badgeClass}`}>Status: {UI_STATUS_META[refund.refund_status].label}</span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-slate-500">Student</p>
                    <p className="font-medium">{refund.user?.full_name || "Unnamed user"}</p>
                    <p className="text-xs text-slate-500">{refund.user?.email || refund.user_id}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-slate-500">Order</p>
                    <p className="font-medium break-all">{orderId || "Unavailable"}</p>
                    <p className="text-xs text-slate-500">{formatAmount(refund.order?.final_paid_amount ?? null, refund.order?.currency ?? null)} · Payment status: {refund.order?.payment_status || "unknown"}</p>
                  </div>
                </div>

                <div className="mt-3 rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{refund.reason || "No reason provided."}</p>
                </div>

                <div className="mt-3">
                  <label className="text-xs uppercase text-slate-500">Admin note</label>
                  <textarea value={draftNotes[refund.id] ?? ""} onChange={(event) => setDraftNotes((prev) => ({ ...prev, [refund.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded border px-3 py-2 text-sm" placeholder="Explain your decision and any refund transaction details" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {availableTransitions.length ? (
                    availableTransitions.map((nextStatus) => (
                      <button key={nextStatus} type="button" disabled={loadingId !== null} onClick={() => updateRefund(refund.id, nextStatus)} className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                        {loadingId === refund.id && pendingActionByRefundId[refund.id] === nextStatus ? nextStatus === "processing" ? "Approving..." : "Rejecting..." : nextStatus === "processing" ? "Approve" : "Reject"}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No further status actions available.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast ? <div className={`fixed bottom-6 right-6 z-50 max-w-md rounded border px-4 py-3 text-sm shadow-lg ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{toast.text}</div> : null}
    </div>
  );
}
