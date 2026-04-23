import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, jsonError, parseAmount, runRpcWithFallback } from "@/lib/institute/payouts";
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

  const [walletResult, activeRequestResult] = await Promise.all([
    admin.data.from("institute_wallet_summary").select("available_balance").eq("institute_id", instituteId).maybeSingle(),
    admin.data
      .from("institute_payout_requests")
      .select("id,status")
      .eq("institute_id", instituteId)
      .in("status", ["requested", "under_review", "approved", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (walletResult.error) return jsonError(walletResult.error.message, 500);
  if (activeRequestResult.error) return jsonError(activeRequestResult.error.message, 500);

  if (activeRequestResult.data?.id) {
    return jsonError("An active payout request already exists. Please wait for admin action.", 409);
  }

  const availableBalance = Number((walletResult.data as { available_balance?: number } | null)?.available_balance ?? 0);
  if (amount > availableBalance) return jsonError("Insufficient available balance for this payout request.", 400);

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

  return NextResponse.json({ ok: true, payout_request: rpcResult.data });
}
