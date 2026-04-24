import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id } = await params;

  const { data: account, error } = await admin.data.from("institute_payout_accounts").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Payout account not found." }, { status: 404 });

  const [instituteResult, requestsResult] = await Promise.all([
    account.institute_id ? admin.data.from("institutes").select("id,name,user_id").eq("id", account.institute_id).maybeSingle() : { data: null, error: null },
    admin.data.from("institute_payout_requests").select("id,status,requested_amount,approved_amount,created_at,paid_at,payment_reference").eq("payout_account_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  if (instituteResult.error) return NextResponse.json({ error: instituteResult.error.message }, { status: 500 });
  if (requestsResult.error) return NextResponse.json({ error: requestsResult.error.message }, { status: 500 });

  const proofUrl = await getSignedPrivateFileUrl({
    bucket: "institute-documents",
    fileRef: String(account.proof_document_path ?? account.proof_document_url ?? ""),
  });

  return NextResponse.json({
    payout_account: {
      ...account,
      institutes: instituteResult.data ?? null,
      payout_requests: requestsResult.data ?? [],
      proof_document_signed_url: proofUrl,
    },
  });
}
