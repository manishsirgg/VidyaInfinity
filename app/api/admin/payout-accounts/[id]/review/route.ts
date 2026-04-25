import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { jsonError } from "@/lib/institute/payouts";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
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

  if (data.institute_id) {
    const { data: instituteRow } = await admin.data
      .from("institutes")
      .select("user_id,name")
      .eq("id", data.institute_id)
      .maybeSingle<{ user_id: string; name: string | null }>();

    await logInstituteWalletEvent(
      {
        instituteId: String(data.institute_id),
        eventType: nextStatus === "approved" ? "payout_account_approved" : nextStatus === "rejected" ? "payout_account_rejected" : "payout_account_status_changed",
        sourceTable: "institute_payout_accounts",
        sourceId: id,
        newStatus: nextStatus,
        actorUserId: auth.user.id,
        actorRole: "admin",
        idempotencyKey: `payout_account:${id}:transition:${nextStatus}`,
        metadata: { rejection_reason: rejectionReason, admin_notes: payload.admin_notes ?? null },
      },
      admin.data
    );

    if (instituteRow?.user_id) {
      const statusVerb = nextStatus === "approved" ? "approved" : nextStatus === "rejected" ? "rejected" : "updated";
      await createAccountNotification({
        userId: instituteRow.user_id,
        type: nextStatus === "approved" ? "approval" : nextStatus === "rejected" ? "rejection" : "payout",
        category: "payout_account",
        priority: nextStatus === "rejected" ? "high" : "normal",
        title: `Payout account ${statusVerb}`,
        message:
          nextStatus === "rejected"
            ? `Your payout account was rejected. Reason: ${rejectionReason ?? "Please review admin notes and resubmit."}`
            : `Your payout account status is now ${nextStatus}.`,
        targetUrl: "/institute/wallet",
        actionLabel: "View payout accounts",
        entityType: "payout_account",
        entityId: id,
        metadata: { nextStatus, rejectionReason, adminNotes: payload.admin_notes ?? null },
        dedupeKey: `payout-review:${id}:${nextStatus}:${instituteRow.user_id}`,
      });
    }
  }

  return NextResponse.json({ payout_account: data });
}
