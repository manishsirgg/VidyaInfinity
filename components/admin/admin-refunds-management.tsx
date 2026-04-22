"use client";

import { useMemo, useState } from "react";

type RefundStatus = "requested" | "approved" | "rejected" | "processed";
type RefundStatusRaw = RefundStatus | "reject";

type RefundRow = {
  id: string;
  user_id: string | null;
  order_kind: "course_enrollment" | "psychometric_test";
  course_order_id: string | null;
  psychometric_order_id: string | null;
  reason: string | null;
  internal_notes: string | null;
  refund_status: RefundStatusRaw;
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

const STATUS_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["processed", "rejected"],
  rejected: [],
  processed: [],
};

function normalizeRefundStatus(status: RefundStatusRaw): RefundStatus {
  return status === "reject" ? "rejected" : status;
}

function formatAmount(amount: number | null, currency: string | null) {
  if (amount === null) return "-";
  const safeCurrency = currency || "INR";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function AdminRefundsManagement({ initialRefunds }: { initialRefunds: RefundRow[] }) {
  const [refunds, setRefunds] = useState(initialRefunds);
  const [statusFilter, setStatusFilter] = useState<RefundStatus | "all">("all");
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRefunds.map((refund) => [refund.id, refund.internal_notes ?? ""])),
  );

  const counts = useMemo(() => {
    return refunds.reduce(
      (acc, refund) => {
        acc[normalizeRefundStatus(refund.refund_status)] += 1;
        return acc;
      },
      { requested: 0, approved: 0, rejected: 0, processed: 0 },
    );
  }, [refunds]);

  const visibleRefunds = useMemo(() => {
    if (statusFilter === "all") return refunds;
    return refunds.filter((refund) => normalizeRefundStatus(refund.refund_status) === statusFilter);
  }, [refunds, statusFilter]);

  async function updateRefund(refundId: string, nextStatus: RefundStatus) {
    setLoadingId(refundId);
    setMessage("");

    const response = await fetch(`/api/admin/refunds/${refundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, adminNote: draftNotes[refundId]?.trim() || null }),
    });

    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update refund");
      return;
    }

    setRefunds((prev) =>
      prev.map((refund) =>
        refund.id === refundId
          ? {
              ...refund,
              refund_status: (body.refund.refund_status as RefundStatusRaw) ?? nextStatus,
              internal_notes: draftNotes[refundId]?.trim() || null,
              processed_at: nextStatus === "processed" ? new Date().toISOString() : refund.processed_at,
              order:
                nextStatus === "processed" && refund.order
                  ? {
                      ...refund.order,
                      payment_status: "refunded",
                    }
                  : refund.order,
            }
          : refund,
      ),
    );

    setMessage(`Refund ${refundId.slice(0, 8)} updated to ${nextStatus}.`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 rounded border bg-white p-4 text-sm sm:grid-cols-5">
        <div className="rounded border p-3">
          <p className="text-slate-500">Total</p>
          <p className="text-lg font-semibold">{refunds.length}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-slate-500">Requested</p>
          <p className="text-lg font-semibold text-amber-700">{counts.requested}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-slate-500">Approved</p>
          <p className="text-lg font-semibold text-blue-700">{counts.approved}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-slate-500">Processed</p>
          <p className="text-lg font-semibold text-emerald-700">{counts.processed}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-slate-500">Rejected</p>
          <p className="text-lg font-semibold text-rose-700">{counts.rejected}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-3 text-sm">
        <span className="font-medium text-slate-700">Filter:</span>
        {["all", "requested", "approved", "processed", "rejected"].map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded px-3 py-1 ${statusFilter === item ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => setStatusFilter(item as RefundStatus | "all")}
          >
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </button>
        ))}
      </div>

      {visibleRefunds.length === 0 ? (
        <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-slate-600">
          No refunds found for the selected filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRefunds.map((refund) => {
            const normalizedStatus = normalizeRefundStatus(refund.refund_status);
            const availableTransitions = STATUS_TRANSITIONS[normalizedStatus];
            const orderId = refund.order_kind === "course_enrollment" ? refund.course_order_id : refund.psychometric_order_id;

            return (
              <div key={refund.id} className="rounded border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {refund.order_kind === "course_enrollment" ? "Course" : "Psychometric"} refund · {refund.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-slate-500">Requested {new Date(refund.requested_at).toLocaleString()}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">Status: {normalizedStatus}</span>
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
                    <p className="text-xs text-slate-500">
                      {formatAmount(refund.order?.final_paid_amount ?? null, refund.order?.currency ?? null)} · Payment status: {refund.order?.payment_status || "unknown"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{refund.reason || "No reason provided."}</p>
                </div>

                <div className="mt-3">
                  <label className="text-xs uppercase text-slate-500">Admin note</label>
                  <textarea
                    value={draftNotes[refund.id] ?? ""}
                    onChange={(event) => setDraftNotes((prev) => ({ ...prev, [refund.id]: event.target.value }))}
                    className="mt-1 min-h-20 w-full rounded border px-3 py-2 text-sm"
                    placeholder="Explain your decision and any refund transaction details"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {availableTransitions.length ? (
                    availableTransitions.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        disabled={loadingId === refund.id}
                        onClick={() => updateRefund(refund.id, nextStatus)}
                        className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {nextStatus === "approved" && "Approve"}
                        {nextStatus === "rejected" && "Reject"}
                        {nextStatus === "processed" && "Mark Processed"}
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

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
