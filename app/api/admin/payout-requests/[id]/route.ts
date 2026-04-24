import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id } = await params;

  const { data: payoutRequest, error } = await admin.data.from("institute_payout_requests").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!payoutRequest) return NextResponse.json({ error: "Payout request not found." }, { status: 404 });

  const [instituteResult, accountResult, allocationsResult, transferAttemptsResult] = await Promise.all([
    payoutRequest.institute_id ? admin.data.from("institutes").select("*").eq("id", payoutRequest.institute_id).maybeSingle() : { data: null, error: null },
    payoutRequest.payout_account_id ? admin.data.from("institute_payout_accounts").select("*").eq("id", payoutRequest.payout_account_id).maybeSingle() : { data: null, error: null },
    admin.data.from("institute_payout_request_allocations").select("*").eq("payout_request_id", id),
    admin.data.from("institute_payout_transfer_attempts").select("*").eq("payout_request_id", id).order("attempted_at", { ascending: false }).limit(10),
  ]);

  if (instituteResult.error) return NextResponse.json({ error: instituteResult.error.message }, { status: 500 });
  if (accountResult.error) return NextResponse.json({ error: accountResult.error.message }, { status: 500 });
  if (allocationsResult.error) return NextResponse.json({ error: allocationsResult.error.message }, { status: 500 });
  if (transferAttemptsResult.error) return NextResponse.json({ error: transferAttemptsResult.error.message }, { status: 500 });

  return NextResponse.json({
    payout_request: {
      ...payoutRequest,
      institutes: instituteResult.data ?? null,
      institute_payout_accounts: accountResult.data ?? null,
      institute_payout_request_allocations: allocationsResult.data ?? [],
      institute_payout_transfer_attempts: transferAttemptsResult.data ?? [],
    },
  });
}
