import { calculatePayoutHolds } from "@/lib/institute/payout-utils";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function buildInstituteFinancialReconciliation(params: {
  instituteId: string;
  ledger: AnyRecord[];
  payoutRequests: AnyRecord[];
}) {
  const { instituteId, ledger, payoutRequests } = params;

  let grossCourseEarnings = 0;
  let grossWebinarEarnings = 0;
  let platformFees = 0;
  let refundReversals = 0;
  let netPayoutLedger = 0;

  for (const row of ledger) {
    const source = normalize(row.payout_source);
    const status = normalize(row.payout_status);
    const payoutAmount = toNumber(row.payout_amount ?? row.amount_payable);
    const grossAmount = Math.max(0, toNumber(row.gross_amount));
    const platformFeeAmount = Math.max(0, toNumber(row.platform_fee_amount));

    if (source === "refund_adjustment") {
      refundReversals += Math.max(toNumber(row.refund_amount), payoutAmount < 0 ? Math.abs(payoutAmount) : 0);
    } else {
      if (source === "course") grossCourseEarnings += grossAmount;
      if (source === "webinar") grossWebinarEarnings += grossAmount;
      platformFees += platformFeeAmount;
    }

    if (!["failed", "reversed"].includes(status)) {
      netPayoutLedger += payoutAmount;
    }
  }

  const paidPayouts = payoutRequests.reduce((sum, row) => {
    if (normalize(row.status) !== "paid") return sum;
    return sum + Math.max(0, toNumber(row.approved_amount ?? row.requested_amount));
  }, 0);

  const payoutHolds = calculatePayoutHolds(payoutRequests, { includeUnderReview: true });
  const availableBalance = Math.max(0, netPayoutLedger - paidPayouts - payoutHolds);

  const mismatchWarnings: string[] = [];
  if (netPayoutLedger < 0) mismatchWarnings.push("Net payout ledger is negative after refund adjustments.");

  const grossEarnings = grossCourseEarnings + grossWebinarEarnings;
  const inferredNetFromGross = grossEarnings - platformFees - refundReversals;
  if (Math.abs(inferredNetFromGross - netPayoutLedger) > 0.01) {
    mismatchWarnings.push("Ledger net payout does not match gross-fee-refund inferred net.");
  }

  return {
    institute_id: instituteId,
    gross_course_earnings: grossCourseEarnings,
    gross_webinar_earnings: grossWebinarEarnings,
    gross_earnings: grossEarnings,
    platform_fees: platformFees,
    net_payout_ledger: netPayoutLedger,
    refund_reversals: refundReversals,
    payout_holds: payoutHolds,
    paid_payouts: paidPayouts,
    available_balance: availableBalance,
    mismatch_warnings: mismatchWarnings,
  };
}
