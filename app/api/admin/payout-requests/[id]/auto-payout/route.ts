import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { jsonError } from "@/lib/institute/payouts";
import { attemptAutoPayout } from "@/lib/payouts/auto-payout";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await attemptAutoPayout({ payoutRequestId: id, adminUserId: auth.user.id });
  if (!result.ok) return jsonError(result.error ?? "Auto payout failed.", 400);

  return NextResponse.json({ ok: true, result });
}
