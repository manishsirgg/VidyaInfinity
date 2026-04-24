import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, loadInstituteWalletSnapshot } from "@/lib/institute/payouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { instituteId, error: instituteError } = await getInstituteIdForUser(auth.user.id);
  if (instituteError) return NextResponse.json({ error: instituteError }, { status: 500 });
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found." }, { status: 404 });

  const snapshotResult = await loadInstituteWalletSnapshot(instituteId);
  if (snapshotResult.error || !snapshotResult.data) return NextResponse.json({ error: snapshotResult.error ?? "Unable to load wallet summary." }, { status: 500 });

  const { summary, ledger, recent_payout_history: recentPayoutHistory, payout_requests: payoutRequests } = snapshotResult.data;
  const { data: auditLogs, error: auditError } = await admin.data
    .from("institute_wallet_audit_logs")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

  return NextResponse.json({
    institute_id: instituteId,
    summary,
    available_balance: Number(summary.available_balance ?? 0),
    gross_revenue: Number(summary.gross_revenue ?? 0),
    platform_fee: Number(summary.platform_fee ?? 0),
    refunded_amount: Number(summary.refunded_amount ?? 0),
    net_earnings: Number(summary.net_earnings ?? 0),
    pending_clearance: Number(summary.pending_clearance ?? 0),
    locked_balance: Number(summary.locked_balance ?? 0),
    paid_out: Number(summary.paid_out ?? 0),
    payout_holds: Number(summary.locked_balance ?? 0),
    reconciliation: summary.reconciliation ?? null,
    payout_requests: payoutRequests,
    recent_payout_history: recentPayoutHistory,
    ledger,
    recent_activity: auditLogs ?? [],
  });
}
