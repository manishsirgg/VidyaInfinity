import { AdminPayoutRequestsManagement } from "@/components/admin/admin-payout-requests-management";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminPayoutRequestsPage() {
  await requireUser("admin");

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Payout Requests</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{admin.error}</p>
      </div>
    );
  }

  const { data, error } = await admin.data.from("institute_payout_requests").select("*").order("created_at", { ascending: false }).limit(500);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Payout Requests</h1>
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
        <h1 className="text-2xl font-semibold">Admin Payout Requests</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{institutesError.message}</p>
      </div>
    );
  }

  const instituteById = new Map((institutes ?? []).map((item) => [item.id, item]));
  const enriched = (data ?? []).map((item) => ({ ...item, institutes: instituteById.get(item.institute_id) ?? null }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Payout Requests</h1>
      <p className="mt-2 text-sm text-slate-600">Review institute withdrawals, inspect allocation snapshots, and move payout states safely.</p>
      <AdminPayoutRequestsManagement initialRequests={enriched} />
    </div>
  );
}
