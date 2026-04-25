import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizePayoutAccountType, normalizePayoutMode, validatePayoutAccountPayload } from "@/lib/institute/payout-account";
import { getInstituteIdForUser, jsonError } from "@/lib/institute/payouts";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const { id } = await params;
  const payload = (await request.json()) as Record<string, unknown>;
  if (payload.account_type !== undefined) {
    return jsonError("account_type cannot be changed after account creation.");
  }

  const { data: existingAccount, error: existingAccountError } = await admin.data
    .from("institute_payout_accounts")
    .select("id,account_type,account_holder_name,bank_name,account_number,ifsc_code,upi_id")
    .eq("id", id)
    .eq("institute_id", instituteId)
    .maybeSingle<{
      id: string;
      account_type: string | null;
      account_holder_name: string | null;
      bank_name: string | null;
      account_number: string | null;
      ifsc_code: string | null;
      upi_id: string | null;
    }>();

  if (existingAccountError) return jsonError(existingAccountError.message, 400);
  if (!existingAccount) return jsonError("Payout account not found.", 404);

  const accountType = normalizePayoutAccountType(existingAccount.account_type);
  if (!accountType) return jsonError("Unsupported payout account type found for this record.", 400);

  const hasSensitiveUpdates =
    payload.account_holder_name !== undefined ||
    payload.bank_name !== undefined ||
    payload.account_number !== undefined ||
    payload.ifsc_code !== undefined ||
    payload.upi_id !== undefined ||
    payload.proof_document_path !== undefined;

  const accountHolderName = payload.account_holder_name !== undefined ? String(payload.account_holder_name ?? "").trim() || null : existingAccount.account_holder_name;
  const bankName = payload.bank_name !== undefined ? String(payload.bank_name ?? "").trim() || null : existingAccount.bank_name;
  const accountNumber = payload.account_number !== undefined ? String(payload.account_number ?? "").trim() || null : existingAccount.account_number;
  const ifscCode = payload.ifsc_code !== undefined ? String(payload.ifsc_code ?? "").trim().toUpperCase() || null : existingAccount.ifsc_code;
  const upiId = payload.upi_id !== undefined ? String(payload.upi_id ?? "").trim() || null : existingAccount.upi_id;

  if (hasSensitiveUpdates) {
    const validationError = validatePayoutAccountPayload({
      accountType,
      accountHolderName,
      bankName,
      accountNumber,
      ifscCode,
      upiId,
    });
    if (validationError) return jsonError(validationError);
  }

  const updates: Record<string, unknown> = {
    account_holder_name: payload.account_holder_name !== undefined ? accountHolderName : undefined,
    bank_name: payload.bank_name !== undefined ? bankName : undefined,
    account_number: payload.account_number !== undefined ? accountNumber : undefined,
    ifsc_code: payload.ifsc_code !== undefined ? ifscCode : undefined,
    upi_id: payload.upi_id !== undefined ? upiId : undefined,
    is_default: payload.is_default,
    payout_mode: payload.payout_mode !== undefined ? normalizePayoutMode(payload.payout_mode) : undefined,
    auto_payout_enabled: payload.payout_mode !== undefined ? normalizePayoutMode(payload.payout_mode) === "auto" : undefined,
    updated_at: new Date().toISOString(),
  };
  if (hasSensitiveUpdates) {
    updates.verification_status = "pending";
    updates.rejection_reason = null;
    updates.admin_notes = null;
    updates.reviewed_at = null;
    updates.reviewed_by = null;
  }

  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));

  const { data, error: updateError } = await admin.data
    .from("institute_payout_accounts")
    .update(cleanUpdates)
    .eq("id", id)
    .eq("institute_id", instituteId)
    .select("*")
    .maybeSingle();

  if (updateError) return jsonError(updateError.message, 400);
  if (!data) return jsonError("Payout account not found.", 404);

  if (cleanUpdates.is_default === true) {
    await admin.data.from("institute_payout_accounts").update({ is_default: false }).eq("institute_id", instituteId).neq("id", id);
  }

  if (hasSensitiveUpdates) {
    const { data: admins } = await admin.data.from("profiles").select("id").eq("role", "admin");
    await Promise.allSettled([
      createAccountNotification({
        userId: auth.user.id,
        type: "resubmission",
        category: "payout_account",
        priority: "normal",
        title: "Payout details resubmitted",
        message: "Your payout account details were updated and sent for fresh admin approval.",
        targetUrl: "/institute/wallet",
        actionLabel: "View status",
        entityType: "payout_account",
        entityId: id,
        dedupeKey: `payout-details-resubmitted:${id}:${auth.user.id}`,
      }),
      ...(admins ?? []).map((row) =>
        createAccountNotification({
          userId: row.id,
          type: "resubmission",
          category: "payout_account",
          priority: "high",
          title: "Payout account details updated",
          message: "An institute updated payout account details and requested admin review.",
          targetUrl: "/admin/payout-accounts",
          actionLabel: "Review account",
          entityType: "payout_account",
          entityId: id,
          dedupeKey: `payout-details-resubmitted-admin:${id}:${row.id}`,
        }),
      ),
    ]);
  }

  return NextResponse.json({ account: data });
}


export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const { id } = await params;
  const { error: deleteError } = await admin.data.from("institute_payout_accounts").delete().eq("id", id).eq("institute_id", instituteId);
  if (deleteError) return jsonError(deleteError.message, 400);

  return NextResponse.json({ ok: true });
}
