export const WEBINAR_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const WEBINAR_STATUSES = ["scheduled", "live", "completed", "cancelled"] as const;
export const WEBINAR_MODES = ["free", "paid"] as const;

export type WebinarApprovalStatus = (typeof WEBINAR_APPROVAL_STATUSES)[number];
export type WebinarStatus = (typeof WEBINAR_STATUSES)[number];
export type WebinarMode = (typeof WEBINAR_MODES)[number];

export function toCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function toDateTimeLabel(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function normalizeWebinarMode(mode: unknown): WebinarMode {
  return mode === "paid" ? "paid" : "free";
}

export function normalizeApprovalStatus(status: unknown): WebinarApprovalStatus {
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

export function shouldShowMeetingJoinWindow(startsAt: string, endsAt: string | null) {
  const startMs = new Date(startsAt).getTime();
  const endMs = endsAt ? new Date(endsAt).getTime() : startMs + 2 * 60 * 60 * 1000;
  const now = Date.now();
  const joinWindowStart = startMs - 15 * 60 * 1000;
  return now >= joinWindowStart && now <= endMs;
}
