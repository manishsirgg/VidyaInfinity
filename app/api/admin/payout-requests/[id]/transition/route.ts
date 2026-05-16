import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { calculatePayoutHolds, jsonError, loadInstituteWalletSnapshot, parseAmount, runRpcWithFallback } from "@/lib/institute/payouts";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { notifyAdminCritical } from "@/lib/notifications/admin-critical";
import { notificationLinks } from "@/lib/notifications/links";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const VALID_STATUSES = ["under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"] as const;

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
  paid: "payout_marked_paid",
  failed: "payout_failed",
  cancelled: "payout_cancelled",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  requested: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["processing", "paid", "failed", "cancelled"],
  processing: ["paid", "failed"],
  failed: ["processing"],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const payload = (await request.json()) as TransitionPayload;

  const nextStatus = String(payload.next_status ?? "").trim().toLowerCase();
  if (nextStatus === "processed") {
    return jsonError("next_status=processed is not allowed. Use next_status=paid for completed payouts.");
  }
  if (!VALID_STATUSES.includes(nextStatus as (typeof VALID_STATUSES)[number])) {
    return jsonError(`next_status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }

  const paymentReference = payload.payment_reference?.trim() || null;
  const failureReason = payload.failure_reason?.trim() || null;
  const adminNote = payload.admin_note?.trim() || null;
  const approvedAmount = payload.approved_amount === null || typeof payload.approved_amount === "undefined" ? null : parseAmount(payload.approved_amount);

  if (nextStatus === "paid" && !paymentReference) {
    void notifyAdminCritical({
      title: "Payout transition blocked: missing payment reference",
      message: "A payout was attempted to be marked paid without payment_reference.",
      category: "payout_failure",
      targetUrl: notificationLinks.adminPayoutUrl(),
      entityType: "payout_request",
      entityId: id,
      dedupeKey: `admin:payout-transition-failed:${id}:paid`,
      metadata: { payoutRequestId: id, targetStatus: "paid" },
    });
    return jsonError("payment_reference (UTR) is required when marking payout as paid.");
  }

  if (nextStatus === "failed" && !failureReason) {
    void notifyAdminCritical({
      title: "Payout transition blocked: missing failure reason",
      message: "A payout was attempted to be marked failed without failure_reason.",
      category: "payout_failure",
      targetUrl: notificationLinks.adminPayoutUrl(),
      entityType: "payout_request",
      entityId: id,
      dedupeKey: `admin:payout-transition-failed:${id}:failed`,
      metadata: { payoutRequestId: id, targetStatus: "failed" },
    });
    return jsonError("failure_reason is required when marking payout as failed.");
  }

  if (approvedAmount !== null && approvedAmount < 0) {
    return jsonError("approved_amount must be a non-negative number.");
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { data: existingRequest, error: existingError } = await admin.data
    .from("institute_payout_requests")
    .select("id,institute_id,status,requested_amount,approved_amount,payment_reference,paid_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      institute_id: string;
      status: string | null;
      requested_amount: number | null;
      approved_amount: number | null;
      payment_reference: string | null;
      paid_at: string | null;
    }>();

  if (existingError) return jsonError(existingError.message, 500);
  if (!existingRequest) return jsonError("Payout request not found.", 404);

  const currentStatus = String(existingRequest.status ?? "").trim().toLowerCase();
  if (currentStatus !== nextStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      return jsonError(
        `Invalid payout status transition: ${currentStatus || "unknown"} -> ${nextStatus}. Allowed: ${allowed.join(", ") || "none"}.`,
        409,
      );
    }
  }

  if (currentStatus === "paid" && nextStatus !== "paid") {
    return jsonError("Paid payout requests are immutable and cannot transition to another status.", 409);
  }

  if (currentStatus === "paid" && nextStatus === "paid") {
    if (existingRequest.payment_reference && paymentReference && paymentReference !== existingRequest.payment_reference) {
      return jsonError("payment_reference is locked once payout is paid.", 409);
    }
    const existingApprovedAmount = Number(existingRequest.approved_amount ?? existingRequest.requested_amount ?? 0);
    const incomingApprovedAmount = approvedAmount ?? existingApprovedAmount;
    const canTreatAsIdempotent =
      existingRequest.paid_at &&
      (!paymentReference || paymentReference === existingRequest.payment_reference) &&
      incomingApprovedAmount === existingApprovedAmount;

    if (canTreatAsIdempotent) {
      return NextResponse.json({ ok: true, idempotent: true, payout_request: existingRequest });
    }

    if (existingRequest.paid_at) {
      return jsonError("paid_at is already set; paid payout cannot be modified.", 409);
    }
  }

  const requestedAmount = Number(existingRequest.requested_amount ?? 0);
  const resolvedApprovedAmount = approvedAmount ?? Number(existingRequest.approved_amount ?? requestedAmount);

  if (nextStatus === "approved" && resolvedApprovedAmount > requestedAmount) {
    return jsonError("approved_amount cannot exceed requested_amount.");
  }

  if (nextStatus === "approved" || nextStatus === "processing" || nextStatus === "paid") {
    const walletSnapshotResult = await loadInstituteWalletSnapshot(existingRequest.institute_id, { ledgerLimit: 500, payoutHistoryLimit: 100 });
    if (walletSnapshotResult.error || !walletSnapshotResult.data) {
      return jsonError(walletSnapshotResult.error ?? "Unable to load institute wallet snapshot.", 500);
    }

    const payoutRequests = walletSnapshotResult.data.payout_requests;
    const holdExcludingCurrent = calculatePayoutHolds(payoutRequests, { includeUnderReview: true, excludePayoutRequestId: id });
    const netEarnings = Number(walletSnapshotResult.data.summary.net_earnings ?? 0);
    const paidOut = Number(walletSnapshotResult.data.summary.paid_out ?? 0);
    const availableAtApprovalTime = Math.max(0, netEarnings - paidOut - holdExcludingCurrent);

    if (resolvedApprovedAmount > availableAtApprovalTime) {
      return jsonError("Approved amount exceeds available payout balance at approval time.", 409);
    }
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

  if (rpcResult.error) {
    void notifyAdminCritical({
      title: "Payout transition failed",
      message: "Admin payout state transition failed and requires review.",
      category: "payout_failure",
      targetUrl: notificationLinks.adminPayoutUrl(),
      entityType: "payout_request",
      entityId: id,
      dedupeKey: `admin:payout-transition-failed:${id}:${nextStatus}`,
      metadata: { payoutRequestId: id, targetStatus: nextStatus, error: rpcResult.error },
    });
    return jsonError(rpcResult.error, 400);
  }

  const updatePayload: Record<string, unknown> = {};
  if (nextStatus === "approved") {
    updatePayload.approved_amount = resolvedApprovedAmount;
  }
  if (nextStatus === "paid") {
    updatePayload.payment_reference = paymentReference;
    updatePayload.paid_at = new Date().toISOString();
  }
  if (nextStatus === "failed") {
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

  if (payoutRequest?.institute_id) {
    const statusLabel = String(payoutRequest.status ?? nextStatus);
    const dedupeByStatus: Record<string, string> = {
      approved: `payout-request-approved:${id}`,
      processing: `payout-request-processing:${id}`,
      paid: `payout-request-paid:${id}`,
      failed: `payout-request-failed:${id}`,
      rejected: `payout-request-rejected:${id}`,
      cancelled: `payout-request-cancelled:${id}`,
    };
    const messageByStatus: Record<string, string> = {
      approved: "Your payout request has been approved.",
      processing: "Your payout request is now being processed.",
      paid: "Your payout request has been marked as paid.",
      failed: `Your payout request failed${failureReason ? `: ${failureReason}` : "."}`,
      rejected: "Your payout request has been rejected.",
      cancelled: "Your payout request has been cancelled.",
    };
    if (dedupeByStatus[statusLabel]) {
      void createAccountNotification({
        userId: payoutRequest.institute_id,
        type: "payout",
        title: `Payout request ${statusLabel.replace("_", " ")}`,
        message: messageByStatus[statusLabel] ?? `Your payout request status changed to ${statusLabel}.`,
        category: "payout",
        targetUrl: notificationLinks.institutePayoutUrl(),
        entityType: "payout_request",
        entityId: id,
        dedupeKey: dedupeByStatus[statusLabel],
        metadata: { payoutRequestId: id, status: statusLabel, failureReason },
      });
    }
  }

  return NextResponse.json({ ok: true, payout_request: rpcResult.data });
}
