import { getRazorpayClient } from "@/lib/payments/razorpay";

export type LocalRefundStatus = "requested" | "processing" | "refunded" | "failed" | "cancelled";

export function toSubunitAmount(amount: number) {
  return Math.round(amount * 100);
}

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

  try {
    const refund = (await razorpay.data.payments.refund(params.paymentId, {
      amount: toSubunitAmount(params.amount),
      notes: params.notes,
      receipt: params.receipt,
    })) as {
      id: string;
      status?: string;
      amount?: number;
      payment_id?: string;
      speed_processed?: string | null;
      created_at?: number;
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
