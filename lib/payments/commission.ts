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
