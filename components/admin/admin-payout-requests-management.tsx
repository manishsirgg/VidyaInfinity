"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { InstitutePayoutRequest } from "@/lib/institute/payout-types";

type AnyRecord = Record<string, unknown>;
type PayoutRequestView = InstitutePayoutRequest & { institutes?: AnyRecord | null };

const STATUSES = ["under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"] as const;

function money(value: number) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: unknown) {
  const input = String(value ?? "");
  if (!input) return "-";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleString("en-IN");
}

function formatPayoutStatusLabel(status: unknown) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "-";
  if (value === "paid") return "Paid";
  if (value === "processed") return "Paid (legacy)";
  return value.replaceAll("_", " ");
}

export function AdminPayoutRequestsManagement({ initialRequests }: { initialRequests: PayoutRequestView[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState<PayoutRequestView[]>(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ? String(initialRequests[0]?.id) : null);
  const [selectedDetail, setSelectedDetail] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>("under_review");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [autoPayouting, setAutoPayouting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selected = useMemo(() => requests.find((item) => String(item.id) === selectedId) ?? null, [requests, selectedId]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setLoading(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/payout-requests/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load payout request detail.");
      setSelectedDetail(body.payout_request ?? null);
      setNextStatus("under_review");
      setApprovedAmount("");
      setPaymentReference("");
      setFailureReason("");
      setAdminNote("");
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to load payout request detail." });
    } finally {
      setLoading(false);
    }
  }

  async function transition() {
    if (!selectedId || transitioning) return;
    if (nextStatus === "paid" && !paymentReference.trim()) {
      setToast({ type: "error", text: "UTR/payment reference is required for paid status." });
      return;
    }
    if (nextStatus === "failed" && !failureReason.trim()) {
      setToast({ type: "error", text: "Failure reason is required for failed status." });
      return;
    }

    setTransitioning(true);
    setToast(null);
    try {
      const parsedApprovedAmount = approvedAmount.trim() ? Number(approvedAmount) : null;
      const response = await fetch(`/api/admin/payout-requests/${selectedId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          next_status: nextStatus,
          approved_amount: parsedApprovedAmount,
          payment_reference: paymentReference || null,
          failure_reason: failureReason || null,
          admin_note: adminNote || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to transition payout request.");

      setToast({ type: "success", text: `Payout request moved to ${nextStatus}.` });
      setRequests((prev) => prev.map((item) => {
        if (String(item.id) !== selectedId) return item;
        return {
          ...item,
          status: nextStatus,
          approved_amount: parsedApprovedAmount ?? item.approved_amount,
          payment_reference: paymentReference || item.payment_reference,
          failure_reason: failureReason || item.failure_reason,
        };
      }));
      await loadDetail(selectedId);
      router.refresh();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to transition payout request." });
    } finally {
      setTransitioning(false);
    }
  }

  async function attemptAutoPayout() {
    if (!selectedId || autoPayouting) return;
    setAutoPayouting(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/payout-requests/${selectedId}/auto-payout`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Auto payout attempt failed.");
      setToast({ type: "success", text: "Auto payout attempted successfully." });
      await loadDetail(selectedId);
      router.refresh();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Auto payout attempt failed." });
    } finally {
      setAutoPayouting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-5">
      <section className="rounded border bg-white p-4 lg:col-span-2">
        <h2 className="text-base font-semibold">Payout Requests</h2>
        <div className="mt-3 space-y-2 text-sm">
          {requests.map((row) => (
            <button key={String(row.id)} type="button" onClick={() => loadDetail(String(row.id))} className={`w-full rounded border px-3 py-2 text-left ${selectedId === String(row.id) ? "border-brand-400 bg-brand-50" : ""}`}>
              <p className="font-medium">{String((row.institutes as AnyRecord | null)?.name ?? "Institute")} · {money(Number(row.requested_amount ?? 0))}</p>
              <p className="text-xs text-slate-500">{formatPayoutStatusLabel(row.status)} · {formatDate(row.created_at)}</p>
            </button>
          ))}
          {requests.length === 0 ? <p className="text-slate-600">No payout requests found.</p> : null}
        </div>
      </section>

      <section className="rounded border bg-white p-4 lg:col-span-3">
        <h2 className="text-base font-semibold">Request Detail</h2>
        {!selected ? <p className="mt-3 text-sm text-slate-600">Select a payout request to inspect details.</p> : null}
        {selected ? (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded border p-3">
              <p className="font-medium">Institute: {String((selected.institutes as AnyRecord | null)?.name ?? "-")}</p>
              <p className="text-xs text-slate-500">
                Requested: {money(Number(selected.requested_amount ?? 0))} · Approved: {money(Number(selected.approved_amount ?? 0))} · Status: {formatPayoutStatusLabel(selected.status)}
              </p>
              <p className="text-xs text-slate-500">Created at: {formatDate(selected.created_at)}</p>
            </div>

            {loading ? <p className="text-slate-600">Loading detail...</p> : null}

            {selectedDetail ? (
              <>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Payout account snapshot</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify((selectedDetail.institute_payout_accounts as AnyRecord | null) ?? {}, null, 2)}</pre>
                </div>

            {selectedDetail?.reconciliation ? (
              <div className="rounded border bg-amber-50 p-3">
                <p className="text-xs uppercase text-slate-500">Wallet reconciliation diagnostics</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[ 
                    ["Gross earnings", Number((selectedDetail.reconciliation as AnyRecord).gross_earnings ?? 0)],
                    ["Commission deducted", Number((selectedDetail.reconciliation as AnyRecord).platform_commission ?? 0)],
                    ["Net earnings", Number((selectedDetail.reconciliation as AnyRecord).net_institute_earnings ?? 0)],
                    ["Paid payouts", Number((selectedDetail.reconciliation as AnyRecord).paid_payouts ?? 0)],
                    ["Held payouts", Number((selectedDetail.reconciliation as AnyRecord).payout_holds ?? 0)],
                    ["Available balance", Number((selectedDetail.reconciliation as AnyRecord).available_payout_balance ?? 0)],
                  ].map(([label, value]) => (
                    <p key={String(label)} className="text-xs text-slate-700">{String(label)}: <span className="font-semibold">{money(Number(value))}</span></p>
                  ))}
                </div>
              </div>
            ) : null}
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Ledger allocations</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify((selectedDetail.institute_payout_request_allocations as AnyRecord[] | null) ?? [], null, 2)}</pre>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Auto payout attempts</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify((selectedDetail.institute_payout_transfer_attempts as AnyRecord[] | null) ?? [], null, 2)}</pre>
                </div>
              </>
            ) : null}

            <div className="rounded border bg-slate-50 p-3">
              <p className="font-medium">Transition request</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} className="rounded border px-2 py-1">
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status === "paid" ? "Paid" : status}</option>
                  ))}
                </select>
                <input value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} placeholder="Approved amount (optional)" className="rounded border px-2 py-1" />
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Payment reference / UTR" className="rounded border px-2 py-1" />
                <input value={failureReason} onChange={(event) => setFailureReason(event.target.value)} placeholder="Failure reason" className="rounded border px-2 py-1" />
              </div>
              <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Admin note" className="mt-2 min-h-20 w-full rounded border px-2 py-1" />
              <button onClick={transition} disabled={transitioning} className="mt-2 rounded bg-brand-600 px-3 py-1.5 text-white disabled:opacity-60">{transitioning ? "Updating..." : "Apply transition"}</button>
              <button onClick={attemptAutoPayout} disabled={autoPayouting} className="ml-2 mt-2 rounded border px-3 py-1.5 text-slate-700 disabled:opacity-60">{autoPayouting ? "Attempting auto payout..." : "Trigger auto payout attempt"}</button>
            </div>
          </div>
        ) : null}
      </section>

      {toast ? <div className={`fixed bottom-6 right-6 z-50 rounded border px-4 py-3 text-sm ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{toast.text}</div> : null}
    </div>
  );
}
