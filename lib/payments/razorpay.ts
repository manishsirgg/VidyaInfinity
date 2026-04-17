import crypto from "node:crypto";
import Razorpay from "razorpay";

import { getServerEnv } from "@/lib/env";

export function getRazorpayClient() {
  const env = getServerEnv();
  if (!env.ok) return env;

  return {
    ok: true as const,
    data: new Razorpay({
      key_id: env.data.RAZORPAY_KEY_ID,
      key_secret: env.data.RAZORPAY_KEY_SECRET,
    }),
  };
}

export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const env = getServerEnv();
  if (!env.ok) return { ok: false as const, error: env.error };

  const expectedSignature = crypto
    .createHmac("sha256", env.data.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return { ok: true as const, valid: expectedSignature === signature };
}

export function verifyRazorpayWebhookSignature(payload: string, signature: string) {
  const env = getServerEnv();
  if (!env.ok) return { ok: false as const, error: env.error };
  if (!env.data.RAZORPAY_WEBHOOK_SECRET) {
    return { ok: false as const, error: "Missing required environment variables: RAZORPAY_WEBHOOK_SECRET" };
  }

  const expected = crypto
    .createHmac("sha256", env.data.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  return { ok: true as const, valid: expected === signature };
}
