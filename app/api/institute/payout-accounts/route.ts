import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizePayoutAccountType, normalizePayoutMode, validatePayoutAccountPayload } from "@/lib/institute/payout-account";
import { getInstituteIdForUser, jsonError } from "@/lib/institute/payouts";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const { data, error: fetchError } = await admin.data
    .from("institute_payout_accounts")
    .select("*")
    .eq("institute_id", instituteId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (fetchError) return jsonError(fetchError.message, 500);

  const accounts = await Promise.all(
    (data ?? []).map(async (item) => {
      const signedProofUrl = await getSignedPrivateFileUrl({
        bucket: "institute-documents",
        fileRef: String(item.proof_document_path ?? item.proof_document_url ?? ""),
      });

      return {
        ...item,
        proof_document_signed_url: signedProofUrl,
      };
    })
  );

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const payload = (await request.json()) as Record<string, unknown>;
  const accountType = normalizePayoutAccountType(payload.account_type);
  if (!accountType) {
    return jsonError("account_type must be bank or upi.");
  }

  const accountHolderName = String(payload.account_holder_name ?? "").trim() || null;
  const bankName = String(payload.bank_name ?? "").trim() || null;
  const accountNumber = String(payload.account_number ?? "").trim() || null;
  const ifscCode = String(payload.ifsc_code ?? "").trim().toUpperCase() || null;
  const upiId = String(payload.upi_id ?? "").trim() || null;

  const validationError = validatePayoutAccountPayload({
    accountType,
    accountHolderName,
    bankName,
    accountNumber,
    ifscCode,
    upiId,
  });
  if (validationError) return jsonError(validationError);

  const createPayload = {
    institute_id: instituteId,
    account_type: accountType,
    account_holder_name: accountHolderName,
    bank_name: bankName,
    account_number: accountNumber,
    ifsc_code: ifscCode,
    upi_id: upiId,
    verification_status: "pending",
    is_default: Boolean(payload.is_default),
    payout_mode: normalizePayoutMode(payload.payout_mode),
    auto_payout_enabled: normalizePayoutMode(payload.payout_mode) === "auto",
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };

  const { data, error: insertError } = await admin.data.from("institute_payout_accounts").insert(createPayload).select("*").single();
  if (insertError) return jsonError(insertError.message, 400);

  if (createPayload.is_default) {
    await admin.data
      .from("institute_payout_accounts")
      .update({ is_default: false })
      .eq("institute_id", instituteId)
      .neq("id", (data as { id: string }).id);
  }

  return NextResponse.json({ account: data }, { status: 201 });
}
