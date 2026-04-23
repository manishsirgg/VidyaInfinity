import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, jsonError } from "@/lib/institute/payouts";
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

  const updates: Record<string, unknown> = {
    account_holder_name: payload.account_holder_name,
    bank_name: payload.bank_name,
    account_number: payload.account_number,
    ifsc_code: typeof payload.ifsc_code === "string" ? payload.ifsc_code.toUpperCase() : payload.ifsc_code,
    upi_id: payload.upi_id,
    verification_status: payload.verification_status,
    is_default: payload.is_default,
    updated_at: new Date().toISOString(),
  };

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
