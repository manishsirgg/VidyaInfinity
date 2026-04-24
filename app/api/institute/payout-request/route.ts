import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { isApprovedAndActiveAccount, normalizePayoutAccountStatus, resolvePayoutAccountBlockingReason } from "@/lib/institute/payout-account";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";
import { getInstituteIdForUser, jsonError, loadInstituteWalletSnapshot, parseAmount, runRpcWithFallback } from "@/lib/institute/payouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MIN_PAYOUT_AMOUNT = 500;

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const payload = (await request.json()) as { payout_account_id?: string; amount?: number };
  const payoutAccountId = String(payload.payout_account_id ?? "").trim();
  const amount = parseAmount(payload.amount);

  if (!payoutAccountId) return jsonError("payout_account_id is required.");
  if (amount === null || amount < MIN_PAYOUT_AMOUNT) return jsonError(`Minimum payout amount is ₹${MIN_PAYOUT_AMOUNT}.`);

  const [walletSnapshotResult, activeRequestResult] = await Promise.all([
    loadInstituteWalletSnapshot(instituteId, { ledgerLimit: 1, payoutHistoryLimit: 1 }),
    admin.data
      .from("institute_payout_requests")
      .select("id,status")
      .eq("institute_id", instituteId)
      .in("status", ["requested", "under_review", "approved", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (walletSnapshotResult.error || !walletSnapshotResult.data) return jsonError(walletSnapshotResult.error ?? "Unable to load wallet balance.", 500);
  if (activeRequestResult.error) return jsonError(activeRequestResult.error.message, 500);

  if (activeRequestResult.data?.id) {
    return jsonError("An active payout request already exists. Please wait for admin action.", 409);
  }

  const availableBalance = Number(walletSnapshotResult.data.summary.available_balance ?? 0);
  if (amount > availableBalance) return jsonError("Insufficient available balance for this payout request.", 400);

  const { data: payoutAccount, error: accountError } = await admin.data
    .from("institute_payout_accounts")
    .select("*")
    .eq("id", payoutAccountId)
    .eq("institute_id", instituteId)
    .maybeSingle<Record<string, unknown>>();
  if (accountError) return jsonError(accountError.message, 500);
  if (!payoutAccount) return jsonError("Payout account not found.", 404);

  const status = normalizePayoutAccountStatus(payoutAccount.verification_status);
  if (!isApprovedAndActiveAccount(payoutAccount)) {
    const reason = resolvePayoutAccountBlockingReason(status);
    if (reason) return jsonError(reason, 400);
    return jsonError("Add and approve a payout account before requesting payout.", 400);
  }

  const rpcResult = await runRpcWithFallback<Record<string, unknown> | string>("create_institute_payout_request", [
    {
      p_institute_id: instituteId,
      p_payout_account_id: payoutAccountId,
      p_amount: amount,
    },
    {
      institute_id: instituteId,
      payout_account_id: payoutAccountId,
      amount,
    },
  ]);

  if (rpcResult.error) {
    const normalized = rpcResult.error.toLowerCase();
    if (normalized.includes("minimum") || normalized.includes("500")) return jsonError(`Minimum payout amount is ₹${MIN_PAYOUT_AMOUNT}.`, 400);
    if (normalized.includes("insufficient")) return jsonError("Insufficient available balance for this payout request.", 400);
    if (normalized.includes("active") || normalized.includes("existing")) {
      return jsonError("An active payout request already exists. Please wait for admin action.", 409);
    }
    return jsonError(rpcResult.error, 400);
  }

  const payoutRequest = (rpcResult.data ?? {}) as Record<string, unknown>;
  await logInstituteWalletEvent(
    {
      instituteId,
      eventType: "payout_requested",
      sourceTable: "institute_payout_requests",
      sourceId: String(payoutRequest.id ?? ""),
      payoutRequestId: String(payoutRequest.id ?? ""),
      amount,
      newStatus: String(payoutRequest.status ?? "requested"),
      actorUserId: auth.user.id,
      actorRole: "institute",
      idempotencyKey: `payout_request:${String(payoutRequest.id ?? "")}`,
      metadata: { payout_account_id: payoutAccountId },
    },
    admin.data
  );

  return NextResponse.json({ ok: true, payout_request: rpcResult.data });
}
