import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildInstituteFinancialReconciliation } from "@/lib/institute/financial-reconciliation";
import { loadInstituteWalletSnapshot } from "@/lib/institute/payouts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id: instituteId } = await params;
  if (!instituteId) return NextResponse.json({ error: "Institute id is required." }, { status: 400 });

  const snapshotResult = await loadInstituteWalletSnapshot(instituteId, { ledgerLimit: 1000, payoutHistoryLimit: 200 });
  if (snapshotResult.error || !snapshotResult.data) {
    return NextResponse.json({ error: snapshotResult.error ?? "Unable to load institute wallet snapshot." }, { status: 500 });
  }

  const reconciliation = buildInstituteFinancialReconciliation({
    instituteId,
    ledger: snapshotResult.data.ledger,
    payoutRequests: snapshotResult.data.payout_requests,
  });

  return NextResponse.json({
    ok: true,
    reconciliation,
    summary: snapshotResult.data.summary,
  });
}
