import { NextResponse } from "next/server";

import {
  calculateAvailablePayoutBalance,
  calculateInstituteWallet,
  calculatePayoutHolds,
  type CanonicalPayoutStatus,
  getPayoutStatusLabel,
  normalizePayoutStatus,
} from "@/lib/institute/payout-utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type { CanonicalPayoutStatus };
export { calculateAvailablePayoutBalance, calculateInstituteWallet, calculatePayoutHolds, getPayoutStatusLabel, normalizePayoutStatus };

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
  reconciliation?: {
    gross_earnings: number;
    platform_commission: number;
    net_institute_earnings: number;
    paid_payouts: number;
    payout_holds: number;
    available_payout_balance: number;
  };
};

export type InstituteWalletSnapshot = {
  summary: InstituteWalletSummary;
  ledger: AnyRecord[];
  payout_requests: AnyRecord[];
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
    reconciliation: {
      gross_earnings: toNumber(row.gross_revenue),
      platform_commission: toNumber(row.platform_fee),
      net_institute_earnings: toNumber(row.net_earnings),
      paid_payouts: toNumber(row.paid_out),
      payout_holds: toNumber(row.locked_balance ?? row.locked_amount),
      available_payout_balance: toNumber(row.available_balance),
    },
  };
}

export async function loadInstituteWalletSnapshot(instituteId: string, options?: { ledgerLimit?: number; payoutHistoryLimit?: number }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { data: null as InstituteWalletSnapshot | null, error: admin.error };

  const ledgerLimit = options?.ledgerLimit ?? 100;
  const payoutHistoryLimit = options?.payoutHistoryLimit ?? 20;

  const [summaryResult, historyResult, historyFallbackResult, ledgerResult, payoutRequestsResult] = await Promise.all([
    admin.data.from("institute_wallet_summary").select("*").eq("institute_id", instituteId).maybeSingle<AnyRecord>(),
    admin.data.from("institute_payout_history").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(payoutHistoryLimit),
    admin.data.from("institute_payout_requests").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(payoutHistoryLimit),
    admin.data.from("institute_payouts").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(ledgerLimit),
    admin.data.from("institute_payout_requests").select("id,status,requested_amount,approved_amount,created_at,paid_at,payment_reference,failure_reason").eq("institute_id", instituteId),
  ]);

  if (ledgerResult.error) return { data: null as InstituteWalletSnapshot | null, error: ledgerResult.error.message };
  if (summaryResult.error) return { data: null as InstituteWalletSnapshot | null, error: summaryResult.error.message };
  if (payoutRequestsResult.error) return { data: null as InstituteWalletSnapshot | null, error: payoutRequestsResult.error.message };

  const ledger = (ledgerResult.data ?? []) as AnyRecord[];
  const payoutRequests = (payoutRequestsResult.data ?? []) as AnyRecord[];
  const summaryFromLedger = calculateInstituteWallet({ instituteId, ledger, payoutRequests, includeUnderReviewInHolds: true });
  const summaryFromView = mapSummaryRow(instituteId, summaryResult.data);
  const summary = summaryResult.data
    ? {
        ...summaryFromView,
        locked_balance: summaryFromLedger.locked_balance,
        paid_out: summaryFromLedger.paid_out,
        available_balance: summaryFromLedger.available_balance,
        reconciliation: summaryFromLedger.reconciliation,
      }
    : summaryFromLedger;
  const recentPayoutHistory = historyResult.error ? (historyFallbackResult.data ?? []) : (historyResult.data ?? []);

  return {
    data: {
      summary,
      ledger,
      payout_requests: payoutRequests,
      recent_payout_history: recentPayoutHistory as AnyRecord[],
    },
    error: null as string | null,
  };
}
