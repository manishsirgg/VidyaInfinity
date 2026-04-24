"use client";

import { useMemo, useState } from "react";

type AnyRecord = Record<string, unknown>;

const STATUS_OPTIONS = ["pending", "approved", "rejected", "disabled"] as const;

function formatDate(value: unknown) {
  const input = String(value ?? "");
  if (!input) return "-";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleString("en-IN");
}

function statusLabel(status: unknown) {
  const value = String(status ?? "pending").toLowerCase();
  if (value === "approved") return "Approved for payouts";
  if (value === "rejected") return "Rejected";
  if (value === "disabled") return "Disabled";
  return "Under review";
}

function maskAccountNumber(value: unknown) {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (!raw) return "-";
  const last4 = raw.slice(-4);
  const maskedPrefix = "*".repeat(Math.max(raw.length - 4, 4));
  return `${maskedPrefix}${last4}`;
}

export function AdminPayoutAccountsManagement({ initialAccounts }: { initialAccounts: AnyRecord[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedId, setSelectedId] = useState<string | null>(initialAccounts[0]?.id ? String(initialAccounts[0]?.id) : null);
  const [selectedDetail, setSelectedDetail] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>("approved");
  const [reason, setReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selected = useMemo(() => accounts.find((item) => String(item.id) === selectedId) ?? null, [accounts, selectedId]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setLoading(true);
    setToast(null);
    setNextStatus("approved");
    setReason("");
    setAdminNotes("");
    try {
      const response = await fetch(`/api/admin/payout-accounts/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load payout account detail.");
      setSelectedDetail(body.payout_account ?? null);
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to load payout account detail." });
    } finally {
      setLoading(false);
    }
  }

  async function review() {
    if (!selectedId || submitting) return;
    if (nextStatus === "rejected" && !reason.trim()) {
      setToast({ type: "error", text: "Rejection reason is required." });
      return;
    }

    setSubmitting(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/payout-accounts/${selectedId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          next_status: nextStatus,
          rejection_reason: reason || null,
          admin_notes: adminNotes || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to review payout account.");
      setToast({ type: "success", text: `Payout account moved to ${nextStatus}.` });
      setAccounts((prev) => prev.map((item) => (String(item.id) === selectedId ? { ...item, verification_status: nextStatus } : item)));
      await loadDetail(selectedId);
      setReason("");
      setAdminNotes("");
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to review payout account." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-5">
      <section className="rounded border bg-white p-4 lg:col-span-2">
        <h2 className="text-base font-semibold">Payout Accounts</h2>
        <div className="mt-3 space-y-2 text-sm">
          {accounts.map((row) => (
            <button
              key={String(row.id)}
              type="button"
              onClick={() => loadDetail(String(row.id))}
              className={`w-full rounded border px-3 py-2 text-left ${selectedId === String(row.id) ? "border-brand-400 bg-brand-50" : ""}`}
            >
              <p className="font-medium">{String((row.institutes as AnyRecord | null)?.name ?? "Institute")} · {String(row.account_type ?? "bank").toUpperCase()}</p>
              <p className="text-xs text-slate-500">{statusLabel(row.verification_status)} · {formatDate(row.created_at)}</p>
            </button>
          ))}
          {accounts.length === 0 ? <p className="text-slate-600">No payout accounts found.</p> : null}
        </div>
      </section>

      <section className="rounded border bg-white p-4 lg:col-span-3">
        <h2 className="text-base font-semibold">Account detail</h2>
        {!selected ? <p className="mt-3 text-sm text-slate-600">Select a payout account.</p> : null}
        {selected ? (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded border p-3">
              <p className="font-medium">Institute: {String((selected.institutes as AnyRecord | null)?.name ?? "-")}</p>
              <p className="text-xs text-slate-500">Type: {String(selected.account_type ?? "-").toUpperCase()} · Status: {statusLabel(selected.verification_status)}</p>
              <p className="text-xs text-slate-500">Created: {formatDate(selected.created_at)} · Updated: {formatDate(selected.updated_at)}</p>
            </div>
            {loading ? <p className="text-slate-600">Loading detail...</p> : null}
            {selectedDetail ? (
              <>
                <div className="rounded border p-3">
                  <p className="text-xs uppercase text-slate-500">Payout account</p>
                  <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Institute name</dt>
                      <dd className="font-medium">{String((selectedDetail.institutes as AnyRecord | null)?.name ?? (selected.institutes as AnyRecord | null)?.name ?? "-")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Account type</dt>
                      <dd className="font-medium">{String(selectedDetail.account_type ?? "-").toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Bank/account holder name</dt>
                      <dd className="font-medium">{String(selectedDetail.account_holder_name ?? "-")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Account number</dt>
                      <dd className="font-medium">{maskAccountNumber(selectedDetail.account_number)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">IFSC code</dt>
                      <dd className="font-medium">{String(selectedDetail.ifsc_code ?? "-")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">UPI ID</dt>
                      <dd className="font-medium">{String(selectedDetail.upi_id ?? "-")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Verification status</dt>
                      <dd className="font-medium">{statusLabel(selectedDetail.verification_status)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Submitted at</dt>
                      <dd className="font-medium">{formatDate(selectedDetail.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Reviewed at</dt>
                      <dd className="font-medium">{formatDate(selectedDetail.reviewed_at)}</dd>
                    </div>
                    {String(selectedDetail.rejection_reason ?? "") ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-slate-500">Rejection reason</dt>
                        <dd className="font-medium text-rose-700">{String(selectedDetail.rejection_reason)}</dd>
                      </div>
                    ) : null}
                    {String(selectedDetail.admin_notes ?? "") ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-slate-500">Admin notes</dt>
                        <dd className="font-medium">{String(selectedDetail.admin_notes)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                {String(selectedDetail.proof_document_signed_url ?? "") ? (
                  <a href={String(selectedDetail.proof_document_signed_url)} target="_blank" rel="noreferrer" className="inline-flex rounded border px-3 py-2 text-xs hover:bg-slate-50">
                    View proof document
                  </a>
                ) : (
                  <p className="text-xs text-amber-700">No proof document uploaded.</p>
                )}
              </>
            ) : null}
            <div className="rounded border bg-slate-50 p-3">
              <p className="font-medium">Review action</p>
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} className="mt-2 w-full rounded border px-2 py-1">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              {nextStatus === "rejected" ? (
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Rejection reason (required)" className="mt-2 w-full rounded border px-2 py-1" />
              ) : null}
              <textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} placeholder="Admin notes" className="mt-2 min-h-20 w-full rounded border px-2 py-1" />
              <button onClick={review} disabled={submitting} className="mt-2 rounded bg-brand-600 px-3 py-1.5 text-white disabled:opacity-60">{submitting ? "Updating..." : "Apply review"}</button>
            </div>
          </div>
        ) : null}
      </section>

      {toast ? <div className={`fixed bottom-6 right-6 z-50 rounded border px-4 py-3 text-sm ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{toast.text}</div> : null}
    </div>
  );
}
