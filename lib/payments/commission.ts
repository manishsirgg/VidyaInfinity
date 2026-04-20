export function sanitizeCommissionPercentage(value: unknown): number | null {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0 || numeric > 100) return null;
  return Number(numeric.toFixed(2));
}

export function calculateCommission(grossAmount: number, commissionPercentage: number) {
  const commissionAmount = (grossAmount * commissionPercentage) / 100;
  const instituteReceivable = grossAmount - commissionAmount;

  return {
    grossAmount,
    commissionPercentage,
    commissionAmount: Number(commissionAmount.toFixed(2)),
    instituteReceivable: Number(instituteReceivable.toFixed(2)),
  };
}
