import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, jsonError } from "@/lib/institute/payouts";
import { deleteFromBucket, STORAGE_BUCKETS, uploadInstituteDocument } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonError(admin.error, 500);

  const { instituteId, error } = await getInstituteIdForUser(auth.user.id);
  if (error) return jsonError(error, 500);
  if (!instituteId) return jsonError("Institute profile not found.", 404);

  const { id } = await params;
  const { data: account, error: accountError } = await admin.data
    .from("institute_payout_accounts")
    .select("id,account_type,proof_document_path")
    .eq("id", id)
    .eq("institute_id", instituteId)
    .maybeSingle<{ id: string; account_type: string | null; proof_document_path: string | null }>();

  if (accountError) return jsonError(accountError.message, 500);
  if (!account) return jsonError("Payout account not found.", 404);

  const form = await request.formData();
  const file = form.get("proof");
  if (!(file instanceof File) || file.size <= 0) {
    return jsonError("Proof document file is required.");
  }

  const allowed = ["application/pdf", "image/png", "image/jpeg"];
  if (!allowed.includes(file.type)) {
    return jsonError("Only PDF, PNG, and JPG documents are allowed.");
  }

  const upload = await uploadInstituteDocument({
    userId: auth.user.id,
    file,
    type: "approval",
  });

  if (upload.error || !upload.path) return jsonError(upload.error ?? "Unable to upload proof document.", 400);

  if (account.proof_document_path) {
    await deleteFromBucket(STORAGE_BUCKETS.instituteDocuments, account.proof_document_path);
  }

  const updatePayload: Record<string, unknown> = {
    proof_document_path: upload.path,
    proof_document_url: upload.path,
    proof_document_name: file.name,
    proof_document_notes: null,
    proof_document_verified_at: null,
    verification_status: "pending",
    rejection_reason: null,
    admin_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  };

  if (String(account.account_type ?? "").toLowerCase() === "bank") {
    updatePayload.proof_document_required = true;
  }

  const { data: updated, error: updateError } = await admin.data
    .from("institute_payout_accounts")
    .update(updatePayload)
    .eq("id", id)
    .eq("institute_id", instituteId)
    .select("*")
    .maybeSingle();

  if (updateError) return jsonError(updateError.message, 500);

  return NextResponse.json({ account: updated });
}
