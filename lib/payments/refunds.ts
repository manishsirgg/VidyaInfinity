import { getRazorpayClient } from "@/lib/payments/razorpay";

export type LocalRefundStatus = "requested" | "processing" | "refunded" | "failed" | "cancelled";

export function toSubunitAmount(amount: number) {
  return Math.round(amount * 100);
}

type RazorpayRefundEntity = {
  id?: string | null;
  status?: string | null;
  amount?: number | null;
  payment_id?: string | null;
  speed_processed?: string | null;
  created_at?: number | null;
} | null;

export function mapRazorpayRefundStatus(status: string | null | undefined): LocalRefundStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "processed") return "refunded";
  if (normalized === "failed") return "failed";
  if (normalized === "pending") return "processing";
  return "processing";
}

export async function createRazorpayRefund(params: {
  paymentId: string;
  amount: number;
  notes?: Record<string, string>;
  receipt?: string;
}) {
  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return { ok: false as const, error: razorpay.error };

  const amountSubunits = toSubunitAmount(params.amount);
  if (!Number.isFinite(amountSubunits) || amountSubunits <= 0) {
    return {
      ok: false as const,
      error: `Invalid refund amount. amount=${params.amount}, subunits=${amountSubunits}`,
    };
  }

  try {
    const rawRefund = (await razorpay.data.payments.refund(params.paymentId, {
      amount: amountSubunits,
      notes: params.notes,
      receipt: params.receipt,
    })) as RazorpayRefundEntity;

    if (!rawRefund || typeof rawRefund !== "object") {
      return {
        ok: false as const,
        error: "Razorpay refund response was empty or malformed",
      };
    }

    if (!rawRefund.id || typeof rawRefund.id !== "string") {
      return {
        ok: false as const,
        error: "Razorpay refund response missing refund id",
      };
    }

    const refund = {
      id: rawRefund.id,
      status: typeof rawRefund.status === "string" ? rawRefund.status : "pending",
      amount: typeof rawRefund.amount === "number" ? rawRefund.amount : null,
      payment_id: typeof rawRefund.payment_id === "string" ? rawRefund.payment_id : null,
      speed_processed: typeof rawRefund.speed_processed === "string" ? rawRefund.speed_processed : null,
      created_at: typeof rawRefund.created_at === "number" ? rawRefund.created_at : null,
    };

    return { ok: true as const, data: refund };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to create Razorpay refund",
    };
  }
}

export async function fetchRazorpayRefund(refundId: string) {
  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return { ok: false as const, error: razorpay.error };

  try {
    const refund = (await razorpay.data.refunds.fetch(refundId)) as {
      id: string;
      status?: string;
      amount?: number;
      payment_id?: string;
    };

    return { ok: true as const, data: refund };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to fetch Razorpay refund",
    };
  }
}
