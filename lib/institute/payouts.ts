import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type CanonicalPayoutStatus = "pending" | "available" | "locked" | "paid" | "reversed" | "failed";

type AnyRecord = Record<string, unknown>;

export type InstituteWalletSummary = {
  institute_id: string;
  gross_revenue: number;
  platform_fee: number;
  refunded_amount: number;
  net_earnings: number;
  pending_clearance: number;
  available_balance: number;
  locked_balance: number;
  paid_out: number;
};

export type InstituteWalletSnapshot = {
  summary: InstituteWalletSummary;
  ledger: AnyRecord[];
  recent_payout_history: AnyRecord[];
};

export async function getInstituteIdForUser(userId: string) {
  const admin = getSupabaseAdmin();
  if (admin.ok) {
    const { data, error } = await admin.data.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
    if (error) return { instituteId: null, error: error.message };
    return { instituteId: data?.id ?? null, error: null };
  }

  return { instituteId: null, error: admin.error };
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function runRpcWithFallback<T>(
  fn: string,
  argVariants: Array<Record<string, unknown>>,
): Promise<{ data: T | null; error: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { data: null, error: admin.error };

  let lastError: string | null = null;

  for (const args of argVariants) {
    const { data, error } = await admin.data.rpc(fn, args);
    if (!error) {
      return { data: (data as T) ?? null, error: null };
    }
    lastError = error.message;
  }

  return { data: null, error: lastError ?? `Unable to execute ${fn}` };
}

export function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

export function resolveUserId(user: User) {
  return user.id;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePayoutStatus(status: unknown, availableAt?: unknown) {
  const value = String(status ?? "pending").trim().toLowerCase();
  if (value === "available") return "available" as CanonicalPayoutStatus;
  if (value === "locked") return "locked" as CanonicalPayoutStatus;
  if (value === "paid" || value === "processed") return "paid" as CanonicalPayoutStatus;
  if (value === "reversed" || value === "cancelled") return "reversed" as CanonicalPayoutStatus;
  if (value === "failed") return "failed" as CanonicalPayoutStatus;
  if (value === "processing") return "locked" as CanonicalPayoutStatus;
  if (value === "pending") {
    const availableTs = availableAt ? new Date(String(availableAt)).getTime() : Number.NaN;
    if (Number.isFinite(availableTs) && availableTs <= Date.now()) return "available" as CanonicalPayoutStatus;
    return "pending" as CanonicalPayoutStatus;
  }
  return "pending" as CanonicalPayoutStatus;
}

function mapSummaryRow(instituteId: string, summaryRow: AnyRecord | null | undefined): InstituteWalletSummary {
  const row = summaryRow ?? {};
  return {
    institute_id: instituteId,
    gross_revenue: toNumber(row.gross_revenue),
    platform_fee: toNumber(row.platform_fee),
    refunded_amount: toNumber(row.refunded_amount),
    net_earnings: toNumber(row.net_earnings),
    pending_clearance: toNumber(row.pending_clearance),
    available_balance: toNumber(row.available_balance),
    locked_balance: toNumber(row.locked_balance ?? row.locked_amount),
    paid_out: toNumber(row.paid_out),
  };
}

function computeSummaryFromLedger(instituteId: string, ledger: AnyRecord[]): InstituteWalletSummary {
  const next: InstituteWalletSummary = {
    institute_id: instituteId,
    gross_revenue: 0,
    platform_fee: 0,
    refunded_amount: 0,
    net_earnings: 0,
    pending_clearance: 0,
    available_balance: 0,
    locked_balance: 0,
    paid_out: 0,
  };

  for (const row of ledger) {
    const payoutAmount = toNumber(row.payout_amount ?? row.amount_payable);
    next.gross_revenue += toNumber(row.gross_amount);
    next.platform_fee += toNumber(row.platform_fee_amount);
    next.refunded_amount += toNumber(row.refund_amount);
    next.net_earnings += payoutAmount;
    const status = normalizePayoutStatus(row.payout_status, row.available_at);
    if (status === "pending") next.pending_clearance += payoutAmount;
    if (status === "available") next.available_balance += payoutAmount;
    if (status === "locked") next.locked_balance += payoutAmount;
    if (status === "paid") next.paid_out += payoutAmount;
    if (status === "reversed" && toNumber(row.refund_amount) === 0) next.refunded_amount += Math.max(payoutAmount, 0);
  }

  return next;
}

export async function loadInstituteWalletSnapshot(instituteId: string, options?: { ledgerLimit?: number; payoutHistoryLimit?: number }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { data: null as InstituteWalletSnapshot | null, error: admin.error };

  const ledgerLimit = options?.ledgerLimit ?? 100;
  const payoutHistoryLimit = options?.payoutHistoryLimit ?? 20;

  const [summaryResult, historyResult, historyFallbackResult, ledgerResult] = await Promise.all([
    admin.data.from("institute_wallet_summary").select("*").eq("institute_id", instituteId).maybeSingle<AnyRecord>(),
    admin.data.from("institute_payout_history").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(payoutHistoryLimit),
    admin.data.from("institute_payout_requests").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(payoutHistoryLimit),
    admin.data.from("institute_payouts").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(ledgerLimit),
  ]);

  if (ledgerResult.error) return { data: null as InstituteWalletSnapshot | null, error: ledgerResult.error.message };
  if (summaryResult.error) return { data: null as InstituteWalletSnapshot | null, error: summaryResult.error.message };

  const ledger = (ledgerResult.data ?? []) as AnyRecord[];
  const summaryFromView = mapSummaryRow(instituteId, summaryResult.data);
  const summary = summaryResult.data ? summaryFromView : computeSummaryFromLedger(instituteId, ledger);
  const recentPayoutHistory = historyResult.error ? (historyFallbackResult.data ?? []) : (historyResult.data ?? []);

  return {
    data: {
      summary,
      ledger,
      recent_payout_history: recentPayoutHistory as AnyRecord[],
    },
    error: null as string | null,
  };
}
