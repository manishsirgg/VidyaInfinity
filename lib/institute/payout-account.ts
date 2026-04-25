export const PAYOUT_ACCOUNT_STATUSES = ["pending", "approved", "rejected", "disabled"] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];
export const PAYOUT_ACCOUNT_TYPES = ["bank", "upi"] as const;
export type PayoutAccountType = (typeof PAYOUT_ACCOUNT_TYPES)[number];

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

export function normalizePayoutAccountType(value: unknown): PayoutAccountType | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "bank" || normalized === "upi") return normalized;
  return null;
}

export type PayoutAccountValidationInput = {
  accountType: PayoutAccountType;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function validatePayoutAccountPayload(input: PayoutAccountValidationInput): string | null {
  if (!hasText(input.accountHolderName)) {
    return "account_holder_name is required.";
  }

  if (input.accountType === "bank") {
    if (!hasText(input.bankName)) return "bank_name is required for bank payout accounts.";
    if (!hasText(input.accountNumber)) return "account_number is required for bank payout accounts.";
    if (!hasText(input.ifscCode)) return "ifsc_code is required for bank payout accounts.";

    const normalizedIfsc = String(input.ifscCode).trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizedIfsc)) {
      return "ifsc_code must be a valid IFSC (example: HDFC0001234).";
    }
  }

  if (input.accountType === "upi") {
    if (!hasText(input.upiId)) return "upi_id is required for upi payout accounts.";
    const normalizedUpi = String(input.upiId).trim();
    if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(normalizedUpi)) {
      return "upi_id must be a valid UPI handle (example: name@bank).";
    }
  }

  return null;
}
