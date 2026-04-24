import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizePayoutMode } from "@/lib/institute/payout-account";
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
  const accountType = String(payload.account_type ?? "").toLowerCase();
  if (!accountType || !["bank", "upi"].includes(accountType)) {
    return jsonError("account_type must be bank or upi.");
  }

  const createPayload = {
    institute_id: instituteId,
    account_type: accountType,
    account_holder_name: String(payload.account_holder_name ?? "").trim() || null,
    bank_name: String(payload.bank_name ?? "").trim() || null,
    account_number: String(payload.account_number ?? "").trim() || null,
    ifsc_code: String(payload.ifsc_code ?? "").trim().toUpperCase() || null,
    upi_id: String(payload.upi_id ?? "").trim() || null,
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
