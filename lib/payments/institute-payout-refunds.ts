import type { SupabaseClient } from "@supabase/supabase-js";

export type RefundPayoutInput = {
  orderKind: string;
  orderId: string;
  refundAmount: number;
  refundReference: string;
};

type RpcResult = { error: { message?: string | null } | null };

type RpcClient = Pick<SupabaseClient, "rpc">;

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
  for (const args of argVariants) {
    const { error } = (await adminClient.rpc("apply_refund_to_institute_payout", args)) as RpcResult;
    if (!error) return { ok: true };
    lastError = error.message ?? lastError;
  }

  return { ok: false, error: lastError };
}
