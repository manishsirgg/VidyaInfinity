const CANONICAL_SUCCESS_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;

export const SUCCESS_PAYMENT_STATUSES = new Set<string>(CANONICAL_SUCCESS_PAYMENT_STATUSES);

export function normalizePaymentStatus(status: string | null | undefined) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

export function isSuccessfulPaymentStatus(status: string | null | undefined) {
  return SUCCESS_PAYMENT_STATUSES.has(normalizePaymentStatus(status));
}

export function isNonSuccessfulTerminalPaymentStatus(status: string | null | undefined) {
  const normalized = normalizePaymentStatus(status);
  return ["failed", "cancelled", "canceled", "refunded", "rejected"].includes(normalized);
}

export function getSuccessfulPaymentStatuses() {
  return [...CANONICAL_SUCCESS_PAYMENT_STATUSES];
}
