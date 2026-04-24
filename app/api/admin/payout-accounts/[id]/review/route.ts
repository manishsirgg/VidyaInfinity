import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { jsonError } from "@/lib/institute/payouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const NEXT_STATUSES = ["pending", "approved", "rejected", "disabled"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { id } = await params;
  const payload = (await request.json()) as { next_status?: string; rejection_reason?: string | null; admin_notes?: string | null };
  const nextStatus = String(payload.next_status ?? "").trim().toLowerCase();
  if (!(NEXT_STATUSES as readonly string[]).includes(nextStatus)) {
    return jsonError(`next_status must be one of: ${NEXT_STATUSES.join(", ")}.`);
  }

  const rejectionReason = payload.rejection_reason?.trim() || null;
  if (nextStatus === "rejected" && !rejectionReason) {
    return jsonError("rejection_reason is required when rejecting payout account.");
  }

  const updatePayload: Record<string, unknown> = {
    verification_status: nextStatus,
    reviewed_by: auth.user.id,
    reviewed_at: new Date().toISOString(),
    admin_notes: payload.admin_notes?.trim() || null,
    rejection_reason: nextStatus === "rejected" ? rejectionReason : null,
    proof_document_verified_at: nextStatus === "approved" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.data.from("institute_payout_accounts").update(updatePayload).eq("id", id).select("*").maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("Payout account not found.", 404);

  return NextResponse.json({ payout_account: data });
}
