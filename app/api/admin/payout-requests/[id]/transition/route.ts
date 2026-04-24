import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { jsonError, parseAmount, runRpcWithFallback } from "@/lib/institute/payouts";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const VALID_STATUSES = ["under_review", "approved", "processing", "processed", "failed", "rejected", "cancelled"] as const;

type TransitionPayload = {
  next_status?: string;
  payment_reference?: string | null;
  failure_reason?: string | null;
  approved_amount?: number | null;
  admin_note?: string | null;
};

const EVENT_BY_STATUS: Partial<Record<(typeof VALID_STATUSES)[number], string>> = {
  approved: "payout_request_approved",
  rejected: "payout_request_rejected",
  processing: "payout_processing_started",
  processed: "payout_marked_paid",
  failed: "payout_failed",
  cancelled: "payout_cancelled",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const payload = (await request.json()) as TransitionPayload;

  const nextStatusRaw = String(payload.next_status ?? "").trim().toLowerCase();
  const nextStatus = nextStatusRaw === "paid" ? "processed" : nextStatusRaw;
  if (!VALID_STATUSES.includes(nextStatus as (typeof VALID_STATUSES)[number])) {
    return jsonError(`next_status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }

  const paymentReference = payload.payment_reference?.trim() || null;
  const failureReason = payload.failure_reason?.trim() || null;
  const adminNote = payload.admin_note?.trim() || null;
  const approvedAmount = payload.approved_amount === null || typeof payload.approved_amount === "undefined" ? null : parseAmount(payload.approved_amount);

  if (nextStatus === "processed" && !paymentReference) {
    return jsonError("payment_reference (UTR) is required when marking payout as processed.");
  }

  if (nextStatus === "failed" && !failureReason) {
    return jsonError("failure_reason is required when marking payout as failed.");
  }

  if (approvedAmount !== null && approvedAmount < 0) {
    return jsonError("approved_amount must be a non-negative number.");
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { data: existingRequest, error: existingError } = await admin.data
    .from("institute_payout_requests")
    .select("id,institute_id,status,requested_amount,approved_amount")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      institute_id: string;
      status: string | null;
      requested_amount: number | null;
      approved_amount: number | null;
    }>();

  if (existingError) return jsonError(existingError.message, 500);
  if (!existingRequest) return jsonError("Payout request not found.", 404);

  const requestedAmount = Number(existingRequest.requested_amount ?? 0);
  const resolvedApprovedAmount = approvedAmount ?? Number(existingRequest.approved_amount ?? requestedAmount);

  if (nextStatus === "approved" && resolvedApprovedAmount > requestedAmount) {
    return jsonError("approved_amount cannot exceed requested_amount.");
  }

  const transitionNote = [adminNote, nextStatus === "failed" && failureReason ? `Failure reason: ${failureReason}` : null]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  const rpcResult = await runRpcWithFallback<Record<string, unknown> | string>("admin_transition_payout_request", [
    {
      p_payout_request_id: id,
      p_next_status: nextStatus,
      p_payment_reference: paymentReference,
      p_admin_note: transitionNote || null,
      p_admin_user_id: auth.user.id,
    },
    {
      payout_request_id: id,
      next_status: nextStatus,
      payment_reference: paymentReference,
      admin_note: transitionNote || null,
      admin_user_id: auth.user.id,
    },
  ]);

  if (rpcResult.error) return jsonError(rpcResult.error, 400);

  const updatePayload: Record<string, unknown> = {};
  if (nextStatus === "approved") {
    updatePayload.approved_amount = resolvedApprovedAmount;
  }
  if (nextStatus === "processed" && paymentReference) {
    updatePayload.payment_reference = paymentReference;
  }
  if (nextStatus === "failed" && failureReason) {
    updatePayload.failure_reason = failureReason;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await admin.data.from("institute_payout_requests").update(updatePayload).eq("id", id);
    if (updateError) return jsonError(updateError.message, 400);
  }

  const { data: payoutRequest } = await admin.data
    .from("institute_payout_requests")
    .select("institute_id,status,requested_amount,approved_amount")
    .eq("id", id)
    .maybeSingle<{
      institute_id: string;
      status: string | null;
      requested_amount: number | null;
      approved_amount: number | null;
    }>();

  if (payoutRequest?.institute_id) {
    await logInstituteWalletEvent(
      {
        instituteId: payoutRequest.institute_id,
        eventType: EVENT_BY_STATUS[nextStatus as (typeof VALID_STATUSES)[number]] ?? "payout_status_changed",
        sourceTable: "institute_payout_requests",
        sourceId: id,
        payoutRequestId: id,
        amount: Number(payoutRequest.approved_amount ?? payoutRequest.requested_amount ?? 0),
        previousStatus: String(existingRequest.status ?? "-"),
        newStatus: String(payoutRequest.status ?? nextStatus),
        actorUserId: auth.user.id,
        actorRole: "admin",
        idempotencyKey: `payout_request:${id}:transition:${nextStatus}`,
        metadata: {
          payment_reference: paymentReference,
          failure_reason: failureReason,
          approved_amount: nextStatus === "approved" ? resolvedApprovedAmount : null,
          admin_note: adminNote,
        },
      },
      admin.data,
    );
  }

  return NextResponse.json({ ok: true, payout_request: rpcResult.data });
}
