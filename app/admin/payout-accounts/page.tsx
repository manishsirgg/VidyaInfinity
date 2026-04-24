import { AdminPayoutAccountsManagement } from "@/components/admin/admin-payout-accounts-management";
import { requireUser } from "@/lib/auth/get-session";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminPayoutAccountsPage() {
  await requireUser("admin");

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Payout Accounts</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{admin.error}</p>
      </div>
    );
  }

  const { data, error } = await admin.data.from("institute_payout_accounts").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Payout Accounts</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.message}</p>
      </div>
    );
  }

  const instituteIds = [...new Set((data ?? []).map((row) => row.institute_id).filter((value): value is string => Boolean(value)))];
  const { data: institutes, error: institutesError } = instituteIds.length
    ? await admin.data.from("institutes").select("id,name,user_id").in("id", instituteIds)
    : { data: [], error: null };

  if (institutesError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Payout Accounts</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{institutesError.message}</p>
      </div>
    );
  }

  const instituteById = new Map((institutes ?? []).map((item) => [item.id, item]));
  const enriched = await Promise.all(
    (data ?? []).map(async (item) => ({
      ...item,
      institutes: instituteById.get(item.institute_id) ?? null,
      proof_document_signed_url: await getSignedPrivateFileUrl({
        bucket: "institute-documents",
        fileRef: String(item.proof_document_path ?? item.proof_document_url ?? ""),
      }),
    }))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Payout Accounts</h1>
      <p className="mt-2 text-sm text-slate-600">Review payout account proofs, approve/reject accounts, and control payout account lifecycle safely.</p>
      <AdminPayoutAccountsManagement initialAccounts={enriched} />
    </div>
  );
}
