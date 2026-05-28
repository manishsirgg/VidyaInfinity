import crypto from "node:crypto";
import Razorpay from "razorpay";

import { getServerEnv } from "@/lib/env";

const PAYMENT_GATEWAY_CONFIG_ERROR = "Payment gateway is not configured. Please contact support.";
const WEBHOOK_CONFIG_ERROR = "Webhook verification is not configured.";

function logRazorpayConfigError(scope: string, error: string) {
  console.error(`[razorpay] ${scope} configuration error`, { error });
}

export function getRazorpayClient() {
  const env = getServerEnv();
  if (!env.ok) {
    logRazorpayConfigError("client", env.error);
    return { ok: false as const, error: PAYMENT_GATEWAY_CONFIG_ERROR };
  }

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
  if (!env.ok) {
    logRazorpayConfigError("signature", env.error);
    return { ok: false as const, error: PAYMENT_GATEWAY_CONFIG_ERROR };
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.data.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return { ok: true as const, valid: expectedSignature === signature };
}

export function verifyRazorpayWebhookSignature(payload: string, signature: string) {
  const env = getServerEnv();
  if (!env.ok) {
    logRazorpayConfigError("webhook", env.error);
    return { ok: false as const, error: WEBHOOK_CONFIG_ERROR };
  }
  if (!env.data.RAZORPAY_WEBHOOK_SECRET) {
    logRazorpayConfigError("webhook", "Missing required environment variables: RAZORPAY_WEBHOOK_SECRET");
    return { ok: false as const, error: WEBHOOK_CONFIG_ERROR };
  }

  const expected = crypto
    .createHmac("sha256", env.data.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  return { ok: true as const, valid: expected === signature };
}
