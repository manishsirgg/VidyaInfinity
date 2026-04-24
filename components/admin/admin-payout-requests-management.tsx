"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AnyRecord = Record<string, unknown>;

const STATUSES = ["under_review", "approved", "processing", "paid", "failed", "rejected"] as const;

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

export function AdminPayoutRequestsManagement({ initialRequests }: { initialRequests: AnyRecord[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ? String(initialRequests[0]?.id) : null);
  const [selectedDetail, setSelectedDetail] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>("under_review");
  const [paymentReference, setPaymentReference] = useState("");
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
      setPaymentReference("");
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

    setTransitioning(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/payout-requests/${selectedId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_status: nextStatus, payment_reference: paymentReference || null, admin_note: adminNote || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to transition payout request.");

      setToast({ type: "success", text: `Payout request moved to ${nextStatus}.` });
      setRequests((prev) => prev.map((item) => (String(item.id) === selectedId ? { ...item, status: nextStatus, payment_reference: paymentReference || item.payment_reference } : item)));
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
              <p className="font-medium">{String((row.institutes as AnyRecord | null)?.name ?? "Institute")} · {money(Number(row.amount ?? row.requested_amount ?? 0))}</p>
              <p className="text-xs text-slate-500">{String(row.status ?? "-")} · {formatDate(row.created_at)}</p>
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
              <p className="text-xs text-slate-500">Amount: {money(Number(selected.amount ?? selected.requested_amount ?? 0))} · Status: {String(selected.status ?? "-")}</p>
              <p className="text-xs text-slate-500">Created at: {formatDate(selected.created_at)}</p>
            </div>

            {loading ? <p className="text-slate-600">Loading detail...</p> : null}

            {selectedDetail ? (
              <>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Payout account snapshot</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify((selectedDetail.institute_payout_accounts as AnyRecord | null) ?? {}, null, 2)}</pre>
                  <p className="mt-2 text-xs text-slate-600">
                    Account status: {String((selectedDetail.institute_payout_accounts as AnyRecord | null)?.verification_status ?? "-")} ·
                    Payout mode: {String((selectedDetail.institute_payout_accounts as AnyRecord | null)?.payout_mode ?? "manual")}
                  </p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Ledger allocations</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify((selectedDetail.institute_payout_request_allocations as AnyRecord[] | null) ?? [], null, 2)}</pre>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Notes</p>
                  <p className="mt-1 text-slate-700">{String(selectedDetail.admin_note ?? selected.admin_note ?? "No note.")}</p>
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
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Payment reference / UTR" className="rounded border px-2 py-1" />
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
