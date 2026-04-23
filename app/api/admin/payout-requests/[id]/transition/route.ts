import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { jsonError, runRpcWithFallback } from "@/lib/institute/payouts";

const VALID_STATUSES = ["under_review", "approved", "processing", "paid", "failed", "rejected"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const payload = (await request.json()) as { next_status?: string; payment_reference?: string | null; admin_note?: string | null };

  const nextStatus = String(payload.next_status ?? "").trim();
  if (!VALID_STATUSES.includes(nextStatus)) {
    return jsonError(`next_status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }

  const paymentReference = payload.payment_reference?.trim() || null;
  if (nextStatus === "paid" && !paymentReference) {
    return jsonError("payment_reference (UTR) is required when marking payout as paid.");
  }

  const rpcResult = await runRpcWithFallback<Record<string, unknown> | string>("admin_transition_payout_request", [
    {
      p_payout_request_id: id,
      p_next_status: nextStatus,
      p_payment_reference: paymentReference,
      p_admin_note: payload.admin_note ?? null,
      p_admin_user_id: auth.user.id,
    },
    {
      payout_request_id: id,
      next_status: nextStatus,
      payment_reference: paymentReference,
      admin_note: payload.admin_note ?? null,
      admin_user_id: auth.user.id,
    },
  ]);

  if (rpcResult.error) return jsonError(rpcResult.error, 400);
  return NextResponse.json({ ok: true, payout_request: rpcResult.data });
}
