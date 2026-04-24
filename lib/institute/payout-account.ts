export const PAYOUT_ACCOUNT_STATUSES = ["pending", "approved", "rejected", "disabled"] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

export function normalizePayoutAccountStatus(input: unknown): PayoutAccountStatus {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "approved" || value === "verified") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "disabled" || value === "inactive") return "disabled";
  return "pending";
}

export function statusLabel(status: unknown) {
  const normalized = normalizePayoutAccountStatus(status);
  if (normalized === "approved") return "Approved for payouts";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "disabled") return "Disabled";
  return "Under review";
}

export function isApprovedAndActiveAccount(account: Record<string, unknown> | null | undefined) {
  if (!account) return false;
  const status = normalizePayoutAccountStatus(account.verification_status);
  const disabled = Boolean(account.is_disabled) || status === "disabled";
  return status === "approved" && !disabled;
}

export function resolvePayoutAccountBlockingReason(status: unknown) {
  const normalized = normalizePayoutAccountStatus(status);
  if (normalized === "pending") return "Your payout account is still under review.";
  if (normalized === "rejected") return "This payout account was rejected. Please update and resubmit it.";
  if (normalized === "disabled") return "This payout account is disabled. Please add another approved account.";
  return null;
}

export function maskAccountNumber(value: unknown) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "-";
  if (cleaned.length <= 4) return cleaned;
  return `${"•".repeat(Math.max(0, cleaned.length - 4))}${cleaned.slice(-4)}`;
}

export function normalizePayoutMode(value: unknown): "manual" | "auto" {
  return String(value ?? "manual").toLowerCase() === "auto" ? "auto" : "manual";
}
