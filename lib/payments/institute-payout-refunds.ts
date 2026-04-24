import type { SupabaseClient } from "@supabase/supabase-js";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";

export type RefundPayoutInput = {
  orderKind: string;
  orderId: string;
  refundAmount: number;
  refundReference: string;
};

type RpcResult = { error: { message?: string | null } | null };

type RpcClient = Pick<SupabaseClient, "rpc" | "from">;

const ORDER_KIND_ALIASES: Record<string, string> = {
  course: "course",
  course_order: "course",
  webinar: "webinar",
  webinar_order: "webinar",
};

function normalizeOrderKind(raw: string | null | undefined) {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return ORDER_KIND_ALIASES[normalized] ?? normalized;
}

export async function applyRefundToInstitutePayout(
  adminClient: RpcClient,
  input: RefundPayoutInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orderKind = normalizeOrderKind(input.orderKind);
  const orderId = String(input.orderId ?? "").trim();
  const refundReference = String(input.refundReference ?? "").trim();
  const refundAmount = Number(input.refundAmount ?? 0);

  if (!orderKind || !orderId || !refundReference || !Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { ok: false, error: "Invalid institute payout refund payload." };
  }

  const argVariants: Array<Record<string, unknown>> = [
    {
      p_order_kind: orderKind,
      p_order_id: orderId,
      p_refund_amount: refundAmount,
      p_refund_reference: refundReference,
    },
    {
      order_kind: orderKind,
      order_id: orderId,
      refund_amount: refundAmount,
      refund_reference: refundReference,
    },
  ];

  let lastError = "Unable to apply refund to institute payout.";
  let payoutInstituteId: string | null = null;
  let payoutId: string | null = null;

  const sourceColumn = orderKind === "course" ? "course_order_id" : "webinar_order_id";
  const { data: payoutRow } = await adminClient
    .from("institute_payouts")
    .select("id,institute_id")
    .eq(sourceColumn, orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; institute_id: string }>();
  payoutInstituteId = payoutRow?.institute_id ?? null;
  payoutId = payoutRow?.id ?? null;

  for (const args of argVariants) {
    const { error } = (await adminClient.rpc("apply_refund_to_institute_payout", args)) as RpcResult;
    if (!error) {
      if (payoutInstituteId) {
        await logInstituteWalletEvent(
          {
            instituteId: payoutInstituteId,
            eventType: "refund_applied",
            sourceTable: "institute_payouts",
            sourceId: payoutId,
            payoutId,
            orderId,
            orderKind,
            amount: refundAmount,
            actorRole: "system",
            idempotencyKey: `refund:${refundReference}`,
            metadata: { refund_reference: refundReference },
          },
          adminClient
        );
      }
      return { ok: true };
    }
    lastError = error.message ?? lastError;
  }

  if (payoutInstituteId) {
    await logInstituteWalletEvent(
      {
        instituteId: payoutInstituteId,
        eventType: "wallet_sync_failed",
        sourceTable: "institute_payouts",
        sourceId: payoutId,
        payoutId,
        orderId,
        orderKind,
        amount: refundAmount,
        actorRole: "system",
        idempotencyKey: `wallet_sync_failed:refund:${refundReference}`,
        metadata: { refund_reference: refundReference, reason: lastError },
      },
      adminClient
    );
  }

  return { ok: false, error: lastError };
}
