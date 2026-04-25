import { calculateInstituteWallet } from "@/lib/institute/payout-utils";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export type RevenueBreakdown = {
  grossPaid: number;
  refunded: number;
  net: number;
};

// Enterprise revenue reporting policy:
// - Gross paid includes only successful paid statuses.
// - Refunded includes only refunded statuses.
// - Net = gross paid - refunded (never below 0 for UI safety).
export function calculateRevenueBreakdown(rows: AnyRecord[], amountField: string): RevenueBreakdown {
  let grossPaid = 0;
  let refunded = 0;

  for (const row of rows) {
    const status = normalize(row.payment_status);
    const amount = toNumber(row[amountField]);
    if (isSuccessfulPaymentStatus(status)) grossPaid += amount;
    if (status === "refunded") refunded += amount;
  }

  return {
    grossPaid,
    refunded,
    net: Math.max(0, grossPaid - refunded),
  };
}

export function calculateNetPlatformFeeRevenue({
  paidOrders,
  orderIdField,
  grossAmountField,
  platformFeeField,
  refunds,
  refundOrderIdField,
  refundAmountField,
}: {
  paidOrders: AnyRecord[];
  orderIdField: string;
  grossAmountField: string;
  platformFeeField: string;
  refunds: AnyRecord[];
  refundOrderIdField: string;
  refundAmountField: string;
}) {
  const paidOrderById = new Map<string, { gross: number; fee: number }>();
  let grossPlatformFee = 0;

  for (const row of paidOrders) {
    const status = normalize(row.payment_status);
    if (!isSuccessfulPaymentStatus(status)) continue;
    const orderId = String(row[orderIdField] ?? "").trim();
    if (!orderId) continue;
    const gross = Math.max(0, toNumber(row[grossAmountField]));
    const fee = Math.max(0, toNumber(row[platformFeeField]));
    paidOrderById.set(orderId, { gross, fee });
    grossPlatformFee += fee;
  }

  let refundedPlatformFee = 0;
  for (const refund of refunds) {
    const refundStatus = normalize(refund.refund_status);
    if (refundStatus !== "refunded") continue;

    const orderId = String(refund[refundOrderIdField] ?? "").trim();
    if (!orderId) continue;
    const paidOrder = paidOrderById.get(orderId);
    if (!paidOrder) continue;

    const refundAmount = Math.max(0, toNumber(refund[refundAmountField]));
    if (!paidOrder.gross || !paidOrder.fee || !refundAmount) continue;

    const ratio = Math.min(1, refundAmount / paidOrder.gross);
    refundedPlatformFee += paidOrder.fee * ratio;
  }

  return {
    grossPlatformFee,
    refundedPlatformFee,
    netPlatformFee: Math.max(0, grossPlatformFee - refundedPlatformFee),
  };
}

export function calculateCanonicalPendingInstitutePayouts({
  payoutLedgerRows,
  payoutRequestRows,
}: {
  payoutLedgerRows: AnyRecord[];
  payoutRequestRows: AnyRecord[];
}) {
  const ledgerByInstitute = new Map<string, AnyRecord[]>();
  const requestsByInstitute = new Map<string, AnyRecord[]>();

  for (const row of payoutLedgerRows) {
    const instituteId = String(row.institute_id ?? "").trim();
    if (!instituteId) continue;
    ledgerByInstitute.set(instituteId, [...(ledgerByInstitute.get(instituteId) ?? []), row]);
  }

  for (const row of payoutRequestRows) {
    const instituteId = String(row.institute_id ?? "").trim();
    if (!instituteId) continue;
    requestsByInstitute.set(instituteId, [...(requestsByInstitute.get(instituteId) ?? []), row]);
  }

  let availablePayable = 0;
  let lockedPayable = 0;
  let paidOut = 0;

  for (const [instituteId, ledger] of ledgerByInstitute.entries()) {
    const payoutRequests = requestsByInstitute.get(instituteId) ?? [];
    const wallet = calculateInstituteWallet({
      instituteId,
      ledger,
      payoutRequests,
      includeUnderReviewInHolds: true,
    });
    availablePayable += toNumber(wallet.available_balance);
    lockedPayable += toNumber(wallet.locked_balance);
    paidOut += toNumber(wallet.paid_out);
  }

  return {
    availablePayable: Math.max(0, availablePayable),
    lockedPayable: Math.max(0, lockedPayable),
    paidOut: Math.max(0, paidOut),
    totalPayable: Math.max(0, availablePayable + lockedPayable),
  };
}
