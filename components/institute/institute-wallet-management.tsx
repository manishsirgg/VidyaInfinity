"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function money(value: number) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN");
}

type AnyRecord = Record<string, unknown>;

function statusLabel(status: unknown) {
  const value = String(status ?? "pending").toLowerCase();
  if (value === "approved") return "Approved for payouts";
  if (value === "rejected") return "Rejected";
  if (value === "disabled") return "Disabled";
  return "Under review";
}

function payoutStatusLabel(status: unknown) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "-";
  if (value === "paid" || value === "processed") return "Paid";
  return value.replaceAll("_", " ");
}

function isAccountEligible(account: AnyRecord) {
  const status = String(account.verification_status ?? "pending").toLowerCase();
  return status === "approved" && !Boolean(account.is_disabled);
}

export function InstituteWalletManagement() {
  const [wallet, setWallet] = useState<AnyRecord | null>(null);
  const [accounts, setAccounts] = useState<AnyRecord[]>([]);
  const [requests, setRequests] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [accountForm, setAccountForm] = useState({
    account_type: "bank",
    account_holder_name: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    upi_id: "",
    is_default: true,
    payout_mode: "manual",
  });

  const [payoutForm, setPayoutForm] = useState({ amount: "", payout_account_id: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, accountsRes, requestsRes] = await Promise.all([
        fetch("/api/institute/wallet", { cache: "no-store" }),
        fetch("/api/institute/payout-accounts", { cache: "no-store" }),
        fetch("/api/institute/payout-requests", { cache: "no-store" }),
      ]);

      const [walletBody, accountsBody, requestsBody] = await Promise.all([walletRes.json(), accountsRes.json(), requestsRes.json()]);

      if (!walletRes.ok) throw new Error(walletBody?.error ?? "Unable to load wallet.");
      if (!accountsRes.ok) throw new Error(accountsBody?.error ?? "Unable to load payout accounts.");
      if (!requestsRes.ok) throw new Error(requestsBody?.error ?? "Unable to load payout requests.");

      setWallet(walletBody);
      setAccounts(accountsBody.accounts ?? []);
      setRequests(requestsBody.payout_requests ?? []);

      const eligible = (accountsBody.accounts ?? []).find((row: AnyRecord) => isAccountEligible(row));
      if (!payoutForm.payout_account_id && eligible?.id) {
        setPayoutForm((prev) => ({ ...prev, payout_account_id: String(eligible.id) }));
      }
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Failed to load wallet details." });
    } finally {
      setLoading(false);
    }
  }, [payoutForm.payout_account_id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const instituteId = String(wallet?.institute_id ?? "").trim();
    if (!instituteId) return;

    const supabase = createClient();
    let realtimeHealthy = false;
    let pollTimer: number | null = null;
    let fallbackTimer: number | null = null;

    const startPolling = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(() => {
        void loadAll();
      }, 45000);
    };
    const stopPolling = () => {
      if (pollTimer === null) return;
      window.clearInterval(pollTimer);
      pollTimer = null;
    };

    const channel = supabase
      .channel(`wallet-live-${instituteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "institute_payouts", filter: `institute_id=eq.${instituteId}` }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "institute_payout_requests", filter: `institute_id=eq.${instituteId}` }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "institute_payout_accounts", filter: `institute_id=eq.${instituteId}` }, () => void loadAll())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeHealthy = true;
          stopPolling();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeHealthy = false;
          startPolling();
        }
      });

    fallbackTimer = window.setTimeout(() => {
      if (!realtimeHealthy) startPolling();
    }, 12000);

    return () => {
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [loadAll, wallet?.institute_id]);

  const summary = useMemo(() => (wallet?.summary as AnyRecord) ?? {}, [wallet?.summary]);
  const ledger = useMemo(() => (wallet?.ledger as AnyRecord[]) ?? [], [wallet?.ledger]);
  const recentPayoutHistory = useMemo(() => (wallet?.recent_payout_history as AnyRecord[]) ?? [], [wallet?.recent_payout_history]);
  const recentActivity = useMemo(() => (wallet?.recent_activity as AnyRecord[]) ?? [], [wallet?.recent_activity]);
  const approvedAccounts = useMemo(() => accounts.filter((row) => isAccountEligible(row)), [accounts]);

  async function uploadProof(accountId: string) {
    if (!proofFile) return;
    const form = new FormData();
    form.set("proof", proofFile);
    const response = await fetch(`/api/institute/payout-accounts/${accountId}/proof`, { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? "Unable to upload proof document.");
  }

  async function addAccount() {
    if (submitting) return;
    const isBank = accountForm.account_type === "bank";
    if (isBank && !proofFile) {
      setToast({ type: "error", text: "Bank accounts require a proof document (PDF/JPG/PNG)." });
      return;
    }

    setSubmitting(true);
    setToast(null);
    try {
      const response = await fetch("/api/institute/payout-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to add payout account.");

      const accountId = String(body?.account?.id ?? "");
      if (accountId && proofFile) await uploadProof(accountId);

      setToast({ type: "success", text: "Payout account submitted for review." });
      setAccountForm({ account_type: "bank", account_holder_name: "", bank_name: "", account_number: "", ifsc_code: "", upi_id: "", is_default: false, payout_mode: "manual" });
      setProofFile(null);
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to add payout account." });
    } finally {
      setSubmitting(false);
    }
  }

  async function setDefaultAccount(id: string) {
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const response = await fetch(`/api/institute/payout-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to update payout account.");
      setToast({ type: "success", text: "Default payout account updated." });
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to update payout account." });
    } finally {
      setSubmitting(false);
    }
  }

  async function updatePayoutMode(id: string, nextMode: "manual" | "auto") {
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const response = await fetch(`/api/institute/payout-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_mode: nextMode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to update payout mode.");
      setToast({ type: "success", text: `Payout mode updated to ${nextMode}.` });
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to update payout mode." });
    } finally {
      setSubmitting(false);
    }
  }

  async function replaceProof(id: string, file: File | null) {
    if (!file || submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const form = new FormData();
      form.set("proof", file);
      const response = await fetch(`/api/institute/payout-accounts/${id}/proof`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to replace proof document.");
      setToast({ type: "success", text: "Proof updated and account resubmitted for review." });
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to replace proof document." });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAccount(id: string) {
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const response = await fetch(`/api/institute/payout-accounts/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to delete payout account.");
      setToast({ type: "success", text: "Payout account removed." });
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to delete payout account." });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPayout() {
    const amount = Number(payoutForm.amount);
    if (!Number.isFinite(amount) || amount < 500) {
      setToast({ type: "error", text: "Minimum payout amount is ₹500." });
      return;
    }
    if (!payoutForm.payout_account_id) {
      setToast({ type: "error", text: "Add and approve a payout account before requesting payout." });
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setToast(null);

    try {
      const response = await fetch("/api/institute/payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_account_id: payoutForm.payout_account_id, amount }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to create payout request.");
      setToast({ type: "success", text: "Payout request submitted." });
      setPayoutForm((prev) => ({ ...prev, amount: "" }));
      await loadAll();
    } catch (error) {
      setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to create payout request." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="mt-6 text-sm text-slate-600">Loading wallet details...</p>;

  return (
    <div className="mt-6 space-y-6">
      {accounts.length === 0 ? <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add payout details to request withdrawals.</div> : null}
      {Number(wallet?.available_balance ?? 0) >= 500 && approvedAccounts.length === 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add and verify your payout account to receive payouts.</div>
      ) : null}
      {Number(wallet?.available_balance ?? 0) >= 500 && approvedAccounts.length > 0 ? <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Balance is available. You can request payout now.</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Available balance", Number(wallet?.available_balance ?? 0)],
          ["Pending clearance", Number(summary.pending_clearance ?? 0)],
          ["Gross revenue", Number(summary.gross_revenue ?? 0)],
          ["Platform fee", Number(summary.platform_fee ?? 0)],
          ["Refunded", Number(summary.refunded_amount ?? 0)],
          ["Net earnings", Number(summary.net_earnings ?? 0)],
          ["Locked", Number(summary.locked_balance ?? summary.locked_amount ?? 0)],
          ["Paid out", Number(summary.paid_out ?? 0)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold">{money(Number(value))}</p>
          </div>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Payout accounts</h2>
          <div className="mt-3 space-y-2">
            {accounts.map((account) => (
              <div key={String(account.id)} className="rounded border p-3 text-sm">
                <p className="font-medium">{String(account.account_type ?? "account").toUpperCase()} · {String(account.account_holder_name ?? "-")}</p>
                <p className="text-xs text-slate-500">Status: {statusLabel(account.verification_status)} {Boolean(account.is_default) ? "· Default" : ""}</p>
                <p className="text-xs text-slate-500">Mode: {String(account.payout_mode ?? "manual")}</p>
                <p className="text-xs text-slate-500">{String(account.bank_name ?? account.upi_id ?? "")}</p>
                {String(account.rejection_reason ?? account.admin_notes ?? "") ? <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{String(account.rejection_reason ?? account.admin_notes)}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!Boolean(account.is_default) ? <button disabled={submitting} onClick={() => setDefaultAccount(String(account.id))} className="rounded border px-2 py-1 text-xs disabled:opacity-60">Set default</button> : null}
                  <button disabled={submitting} onClick={() => updatePayoutMode(String(account.id), String(account.payout_mode ?? "manual") === "auto" ? "manual" : "auto")} className="rounded border px-2 py-1 text-xs disabled:opacity-60">Toggle mode</button>
                  <label className="rounded border px-2 py-1 text-xs">
                    Replace proof
                    <input type="file" className="hidden" accept="application/pdf,image/png,image/jpeg" onChange={(event) => void replaceProof(String(account.id), event.target.files?.[0] ?? null)} />
                  </label>
                  {String(account.proof_document_signed_url ?? "") ? <a href={String(account.proof_document_signed_url)} target="_blank" rel="noreferrer" className="rounded border px-2 py-1 text-xs">View proof</a> : null}
                  <button disabled={submitting} onClick={() => deleteAccount(String(account.id))} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-60">Delete</button>
                </div>
              </div>
            ))}
            {accounts.length === 0 ? <p className="text-sm text-slate-600">No payout accounts added yet.</p> : null}
          </div>

          <div className="mt-4 space-y-2 rounded border bg-slate-50 p-3 text-sm">
            <p className="font-medium">Add payout account</p>
            <select value={accountForm.account_type} onChange={(event) => setAccountForm((prev) => ({ ...prev, account_type: event.target.value }))} className="w-full rounded border px-2 py-1">
              <option value="bank">Bank</option>
              <option value="upi">UPI</option>
            </select>
            <input value={accountForm.account_holder_name} onChange={(event) => setAccountForm((prev) => ({ ...prev, account_holder_name: event.target.value }))} placeholder="Account holder" className="w-full rounded border px-2 py-1" />
            {accountForm.account_type === "bank" ? (
              <>
                <input value={accountForm.bank_name} onChange={(event) => setAccountForm((prev) => ({ ...prev, bank_name: event.target.value }))} placeholder="Bank name" className="w-full rounded border px-2 py-1" />
                <input value={accountForm.account_number} onChange={(event) => setAccountForm((prev) => ({ ...prev, account_number: event.target.value }))} placeholder="Account number" className="w-full rounded border px-2 py-1" />
                <input value={accountForm.ifsc_code} onChange={(event) => setAccountForm((prev) => ({ ...prev, ifsc_code: event.target.value }))} placeholder="IFSC code" className="w-full rounded border px-2 py-1" />
              </>
            ) : (
              <input value={accountForm.upi_id} onChange={(event) => setAccountForm((prev) => ({ ...prev, upi_id: event.target.value }))} placeholder="UPI ID" className="w-full rounded border px-2 py-1" />
            )}
            <select value={accountForm.payout_mode} onChange={(event) => setAccountForm((prev) => ({ ...prev, payout_mode: event.target.value }))} className="w-full rounded border px-2 py-1">
              <option value="manual">Manual payout</option>
              <option value="auto">Auto payout</option>
            </select>
            <label className="text-xs text-slate-600">Proof document ({accountForm.account_type === "bank" ? "required" : "optional"})</label>
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} className="w-full rounded border px-2 py-1" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={accountForm.is_default} onChange={(event) => setAccountForm((prev) => ({ ...prev, is_default: event.target.checked }))} />
              Set as default
            </label>
            <button disabled={submitting} onClick={addAccount} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">{submitting ? "Saving..." : "Save account"}</button>
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Request payout</h2>
          <p className="mt-1 text-sm text-slate-600">Available balance: <span className="font-semibold">{money(Number(wallet?.available_balance ?? 0))}</span></p>
          <div className="mt-3 grid gap-2 text-sm">
            <input value={payoutForm.amount} onChange={(event) => setPayoutForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="Amount" className="w-full rounded border px-2 py-1" />
            <select value={payoutForm.payout_account_id} onChange={(event) => setPayoutForm((prev) => ({ ...prev, payout_account_id: event.target.value }))} className="w-full rounded border px-2 py-1">
              <option value="">Select approved payout account</option>
              {approvedAccounts.map((account) => (
                <option key={String(account.id)} value={String(account.id)}>
                  {String(account.account_type).toUpperCase()} · {String(account.bank_name ?? account.upi_id ?? account.account_holder_name ?? "Account")}
                </option>
              ))}
            </select>
            <button disabled={submitting || approvedAccounts.length === 0} onClick={requestPayout} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">{submitting ? "Submitting..." : "Submit payout request"}</button>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Recent payout requests</h3>
            <div className="mt-2 space-y-2 text-sm">
              {recentPayoutHistory.map((row, index) => (
                <div key={String(row.id ?? index)} className="rounded border px-3 py-2">
                  <p className="font-medium">Requested: {money(Number(row.requested_amount ?? 0))} · Approved: {money(Number(row.approved_amount ?? 0))} · {payoutStatusLabel(row.status)}</p>
                  <p className="text-xs text-slate-500">Requested: {formatDate(String(row.created_at ?? ""))}</p>
                  <p className="text-xs text-slate-500">Reference: {String(row.payment_reference ?? "-")}</p>
                </div>
              ))}
              {recentPayoutHistory.length === 0 ? <p className="text-slate-600">No payout requests yet.</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="text-base font-semibold">All payout requests</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-2">Request</th><th className="px-2 py-2">Amount</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Dates</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row, index) => (
                <tr key={String(row.id ?? index)} className="border-b last:border-0">
                  <td className="px-2 py-2">{String(row.id ?? "-")}</td>
                  <td className="px-2 py-2">Req {money(Number(row.requested_amount ?? 0))} · Appr {money(Number(row.approved_amount ?? 0))}</td>
                  <td className="px-2 py-2">{payoutStatusLabel(row.status)}</td>
                  <td className="px-2 py-2">{String(row.payment_reference ?? "-")}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">Created: {formatDate(String(row.created_at ?? ""))}<br />Updated: {formatDate(String(row.updated_at ?? ""))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 ? <p className="py-3 text-sm text-slate-600">No payout requests found.</p> : null}
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <div className="mt-3 space-y-2 text-sm">
          {recentActivity.map((row, index) => (
            <div key={String(row.id ?? index)} className="rounded border px-3 py-2">
              <p className="font-medium">{String(row.event_type ?? "-")}</p>
              <p className="text-xs text-slate-500">
                Amount: {money(Number(row.amount ?? 0))} · Status: {payoutStatusLabel(row.previous_status)} → {payoutStatusLabel(row.new_status)}
              </p>
              <p className="text-xs text-slate-500">At: {formatDate(String(row.created_at ?? ""))}</p>
            </div>
          ))}
          {recentActivity.length === 0 ? <p className="text-slate-600">No wallet activity yet.</p> : null}
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="text-base font-semibold">Ledger</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-2">Source</th><th className="px-2 py-2">Amount</th><th className="px-2 py-2">Fee</th><th className="px-2 py-2">Refund</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Dates</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row, index) => (
                <tr key={String(row.id ?? index)} className="border-b last:border-0">
                  <td className="px-2 py-2">{String(row.payout_source ?? row.source_reference_type ?? "-")}</td>
                  <td className="px-2 py-2">{money(Number(row.gross_amount ?? row.amount ?? 0))}</td>
                  <td className="px-2 py-2">{money(Number(row.platform_fee_amount ?? row.fee_amount ?? 0))}</td>
                  <td className="px-2 py-2">{money(Number(row.refund_amount ?? 0))}</td>
                  <td className="px-2 py-2">{payoutStatusLabel(row.payout_status ?? row.status)}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">Created: {formatDate(String(row.created_at ?? ""))}<br />Updated: {formatDate(String(row.updated_at ?? ""))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 ? <p className="py-3 text-sm text-slate-600">No ledger entries yet.</p> : null}
        </div>
      </section>

      {toast ? <div className={`fixed bottom-6 right-6 z-50 rounded border px-4 py-3 text-sm ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{toast.text}</div> : null}
    </div>
  );
}
