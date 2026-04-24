export type PayoutRequestHoldStatus = "under_review" | "approved" | "processing";

export type CanonicalPayoutStatus = "pending" | "available" | "locked" | "paid" | "reversed" | "failed";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePayoutStatus(status: unknown, availableAt?: unknown): CanonicalPayoutStatus {
  const value = String(status ?? "pending").trim().toLowerCase();
  if (value === "available") return "available";
  if (value === "locked") return "locked";
  // Backward-compatible read-side support for legacy rows.
  if (value === "paid" || value === "processed") return "paid";
  if (value === "reversed" || value === "cancelled") return "reversed";
  if (value === "failed") return "failed";
  if (value === "processing") return "locked";
  if (value === "pending") {
    const availableTs = availableAt ? new Date(String(availableAt)).getTime() : Number.NaN;
    if (Number.isFinite(availableTs) && availableTs <= Date.now()) return "available";
    return "pending";
  }
  return "pending";
}

export function getPayoutStatusLabel(status: unknown) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "-";
  if (value === "paid" || value === "processed") return "Paid";
  return value.replaceAll("_", " ");
}

export function calculatePayoutHolds(
  payoutRequests: AnyRecord[],
  options?: { includeUnderReview?: boolean; excludePayoutRequestId?: string | null }
) {
  const includeUnderReview = options?.includeUnderReview ?? true;
  const excluded = String(options?.excludePayoutRequestId ?? "").trim();

  return payoutRequests.reduce((total, row) => {
    if (excluded && String(row.id ?? "") === excluded) return total;
    const status = String(row.status ?? "").trim().toLowerCase();
    const isHoldStatus = status === "approved" || status === "processing" || (includeUnderReview && status === "under_review");
    if (!isHoldStatus) return total;
    const holdAmount = toNumber(row.approved_amount ?? row.requested_amount);
    return total + Math.max(0, holdAmount);
  }, 0);
}

export function calculateAvailablePayoutBalance({
  netInstituteEarnings,
  paidPayouts,
  payoutHolds,
}: {
  netInstituteEarnings: number;
  paidPayouts: number;
  payoutHolds: number;
}) {
  return Math.max(0, Number(netInstituteEarnings ?? 0) - Number(paidPayouts ?? 0) - Number(payoutHolds ?? 0));
}

export function calculateInstituteWallet({
  instituteId,
  ledger,
  payoutRequests,
  includeUnderReviewInHolds = true,
}: {
  instituteId: string;
  ledger: AnyRecord[];
  payoutRequests: AnyRecord[];
  includeUnderReviewInHolds?: boolean;
}) {
  let grossRevenue = 0;
  let platformCommission = 0;
  let refundedAmount = 0;
  let pendingClearance = 0;

  // Canonical earnings source: institute_payouts ledger rows synced from paid course_orders/webinar_orders.
  // We intentionally avoid summing raw orders directly here to prevent duplicate earnings.
  for (const row of ledger) {
    const payoutAmount = toNumber(row.payout_amount ?? row.amount_payable);
    const status = normalizePayoutStatus(row.payout_status, row.available_at);

    grossRevenue += Math.max(0, toNumber(row.gross_amount));
    platformCommission += Math.max(0, toNumber(row.platform_fee_amount));
    refundedAmount += Math.max(0, toNumber(row.refund_amount));

    if (status === "pending") {
      pendingClearance += payoutAmount;
    }
  }

  const netInstituteEarnings = Math.max(0, grossRevenue - platformCommission - refundedAmount);
  const paidPayouts = payoutRequests.reduce((total, row) => {
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status !== "paid") return total;
    return total + Math.max(0, toNumber(row.approved_amount ?? row.requested_amount));
  }, 0);

  const payoutHolds = calculatePayoutHolds(payoutRequests, { includeUnderReview: includeUnderReviewInHolds });
  const availableBalance = calculateAvailablePayoutBalance({
    netInstituteEarnings,
    paidPayouts,
    payoutHolds,
  });

  return {
    institute_id: instituteId,
    gross_revenue: grossRevenue,
    platform_fee: platformCommission,
    refunded_amount: refundedAmount,
    net_earnings: netInstituteEarnings,
    pending_clearance: pendingClearance,
    available_balance: availableBalance,
    locked_balance: payoutHolds,
    paid_out: paidPayouts,
    reconciliation: {
      gross_earnings: grossRevenue,
      platform_commission: platformCommission,
      net_institute_earnings: netInstituteEarnings,
      paid_payouts: paidPayouts,
      payout_holds: payoutHolds,
      available_payout_balance: availableBalance,
    },
  };
}
