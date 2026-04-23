import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, jsonError } from "@/lib/institute/payouts";
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
    .from("institute_payout_requests")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  return NextResponse.json({ payout_requests: data ?? [] });
}
