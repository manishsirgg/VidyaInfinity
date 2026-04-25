import { calculateInstituteWallet } from "@/lib/institute/payout-utils";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateNetRevenue(rows: AnyRecord[], amountField: string) {
  let paid = 0;
  let refunded = 0;

  for (const row of rows) {
    const status = String(row.payment_status ?? "").trim().toLowerCase();
    const amount = toNumber(row[amountField]);
    if (isSuccessfulPaymentStatus(status)) paid += amount;
    if (status === "refunded") refunded += amount;
  }

  return {
    paid,
    refunded,
    net: Math.max(0, paid - refunded),
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
  }

  return {
    availablePayable: Math.max(0, availablePayable),
    lockedPayable: Math.max(0, lockedPayable),
    totalPayable: Math.max(0, availablePayable + lockedPayable),
  };
}
