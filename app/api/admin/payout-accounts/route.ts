import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const accountType = searchParams.get("account_type");
  const instituteId = searchParams.get("institute_id");

  let query = admin.data.from("institute_payout_accounts").select("*").order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("verification_status", status);
  if (accountType) query = query.eq("account_type", accountType);
  if (instituteId) query = query.eq("institute_id", instituteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const instituteIds = [...new Set((data ?? []).map((row) => row.institute_id).filter((value): value is string => Boolean(value)))];
  const { data: institutes, error: instituteError } = instituteIds.length
    ? await admin.data.from("institutes").select("id,name,user_id").in("id", instituteIds)
    : { data: [], error: null };
  if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });

  const instituteById = new Map((institutes ?? []).map((item) => [item.id, item]));

  const payoutAccounts = await Promise.all(
    (data ?? []).map(async (item) => ({
      ...item,
      institutes: instituteById.get(item.institute_id) ?? null,
      proof_document_signed_url: await getSignedPrivateFileUrl({
        bucket: "institute-documents",
        fileRef: String(item.proof_document_path ?? item.proof_document_url ?? ""),
      }),
    }))
  );

  return NextResponse.json({ payout_accounts: payoutAccounts });
}
