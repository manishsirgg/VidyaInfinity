import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser } from "@/lib/institute/payouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { instituteId, error: instituteError } = await getInstituteIdForUser(auth.user.id);
  if (instituteError) return NextResponse.json({ error: instituteError }, { status: 500 });
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found." }, { status: 404 });

  const [summaryResult, payoutsResult, ledgerResult] = await Promise.all([
    admin.data.from("institute_wallet_summary").select("*").eq("institute_id", instituteId).maybeSingle(),
    admin.data.from("institute_payout_requests").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(20),
    admin.data.from("institute_payouts").select("*").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(100),
  ]);

  if (summaryResult.error) return NextResponse.json({ error: summaryResult.error.message }, { status: 500 });
  if (payoutsResult.error) return NextResponse.json({ error: payoutsResult.error.message }, { status: 500 });
  if (ledgerResult.error) return NextResponse.json({ error: ledgerResult.error.message }, { status: 500 });

  const summary = summaryResult.data ?? {};
  const availableBalance = Number((summary as Record<string, unknown>).available_balance ?? 0);

  return NextResponse.json({
    institute_id: instituteId,
    summary,
    available_balance: availableBalance,
    recent_payout_history: payoutsResult.data ?? [],
    ledger: ledgerResult.data ?? [],
  });
}
