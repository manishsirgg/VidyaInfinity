import { runRpcWithFallback } from "@/lib/institute/payouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AnyRecord = Record<string, unknown>;

type ProviderResult = {
  ok: boolean;
  providerReference?: string;
  rawResponse?: AnyRecord;
  error?: string;
};

function isAutoPayoutEnabled() {
  return process.env.AUTO_PAYOUT_ENABLED === "true";
}

async function executeProviderTransfer(): Promise<ProviderResult> {
  const provider = process.env.AUTO_PAYOUT_PROVIDER?.trim().toLowerCase() || "";
  if (!provider) return { ok: false, error: "AUTO_PAYOUT_PROVIDER is not configured" };

  // Stub-safe mode. Wire real provider here once credentials and endpoint are configured.
  if (process.env.AUTO_PAYOUT_PROVIDER_STUB !== "false") {
    return {
      ok: false,
      error: `Provider ${provider} is running in stub/manual fallback mode`,
      rawResponse: { provider, mode: "stub" },
    };
  }

  return { ok: false, error: `Provider ${provider} integration is not implemented` };
}

export async function attemptAutoPayout({ payoutRequestId, adminUserId }: { payoutRequestId: string; adminUserId: string }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const { data: payoutRequest, error: payoutError } = await admin.data
    .from("institute_payout_requests")
    .select("*")
    .eq("id", payoutRequestId)
    .maybeSingle<AnyRecord>();
  if (payoutError) return { ok: false, error: payoutError.message };
  if (!payoutRequest) return { ok: false, error: "Payout request not found." };

  const status = String(payoutRequest.status ?? "").toLowerCase();
  if (!["approved", "processing"].includes(status)) {
    return { ok: false, error: "Auto payout can only be attempted for approved or processing payout requests." };
  }

  const { data: account, error: accountError } = await admin.data
    .from("institute_payout_accounts")
    .select("*")
    .eq("id", String(payoutRequest.payout_account_id ?? ""))
    .maybeSingle<AnyRecord>();
  if (accountError) return { ok: false, error: accountError.message };
  if (!account) return { ok: false, error: "Payout account not found for this request." };

  if (String(account.verification_status ?? "pending").toLowerCase() !== "approved") {
    return { ok: false, error: "Payout account is not approved for auto payout." };
  }

  if (!isAutoPayoutEnabled()) {
    return { ok: false, error: "Platform auto payout is disabled. Continue with manual payout flow." };
  }

  const existingAttempt = await admin.data
    .from("institute_payout_transfer_attempts")
    .select("id,status")
    .eq("payout_request_id", payoutRequestId)
    .eq("status", "success")
    .limit(1)
    .maybeSingle();
  if (existingAttempt.data?.id) {
    return { ok: false, error: "This payout request already has a successful transfer attempt." };
  }

  const startedAt = new Date().toISOString();
  const { data: attempt, error: attemptInsertError } = await admin.data
    .from("institute_payout_transfer_attempts")
    .insert({
      payout_request_id: payoutRequestId,
      institute_id: payoutRequest.institute_id,
      payout_account_id: payoutRequest.payout_account_id,
      provider: process.env.AUTO_PAYOUT_PROVIDER ?? null,
      status: "attempting",
      initiated_by: adminUserId,
      requested_amount: payoutRequest.amount,
      attempted_at: startedAt,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (attemptInsertError) return { ok: false, error: attemptInsertError.message };

  const providerResult = await executeProviderTransfer();

  if (!providerResult.ok) {
    await admin.data.from("institute_payout_transfer_attempts").update({
      status: "failed",
      error_message: providerResult.error ?? "Auto payout failed",
      provider_response: providerResult.rawResponse ?? null,
      completed_at: new Date().toISOString(),
    }).eq("id", attempt?.id ?? "");

    await admin.data.from("institute_payout_accounts").update({
      last_auto_payout_attempt_at: startedAt,
      last_auto_payout_error: providerResult.error ?? "Auto payout failed",
      updated_at: new Date().toISOString(),
    }).eq("id", String(account.id));

    await runRpcWithFallback("admin_transition_payout_request", [
      {
        p_payout_request_id: payoutRequestId,
        p_next_status: "failed",
        p_payment_reference: null,
        p_admin_note: `Auto payout failed: ${providerResult.error ?? "Unknown error"}`,
        p_admin_user_id: adminUserId,
      },
      {
        payout_request_id: payoutRequestId,
        next_status: "failed",
        payment_reference: null,
        admin_note: `Auto payout failed: ${providerResult.error ?? "Unknown error"}`,
        admin_user_id: adminUserId,
      },
    ]);

    return { ok: false, error: providerResult.error ?? "Auto payout failed." };
  }

  await admin.data.from("institute_payout_transfer_attempts").update({
    status: "success",
    provider_reference: providerResult.providerReference ?? null,
    provider_response: providerResult.rawResponse ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", attempt?.id ?? "");

  await admin.data.from("institute_payout_accounts").update({
    last_auto_payout_attempt_at: startedAt,
    last_auto_payout_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", String(account.id));

  const transition = await runRpcWithFallback("admin_transition_payout_request", [
    {
      p_payout_request_id: payoutRequestId,
      p_next_status: "processed",
      p_payment_reference: providerResult.providerReference ?? `AUTO-${payoutRequestId}`,
      p_admin_note: "Paid via auto payout provider",
      p_admin_user_id: adminUserId,
    },
    {
      payout_request_id: payoutRequestId,
      next_status: "processed",
      payment_reference: providerResult.providerReference ?? `AUTO-${payoutRequestId}`,
      admin_note: "Paid via auto payout provider",
      admin_user_id: adminUserId,
    },
  ]);

  if (transition.error) return { ok: false, error: transition.error };
  return { ok: true, payout_request: transition.data, provider_reference: providerResult.providerReference ?? null };
}
