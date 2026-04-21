import { AdminRefundsManagement } from "@/components/admin/admin-refunds-management";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function Page() {
  await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Refunds</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{admin.error}</p>
      </div>
    );
  }

  const { data: refunds, error } = await admin.data
    .from("refunds")
    .select(
      "id,user_id,order_kind,course_order_id,psychometric_order_id,reason,internal_notes,refund_status,amount,requested_at,processed_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Refunds</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.message}</p>
      </div>
    );
  }

  const userIds = [...new Set((refunds ?? []).map((refund) => refund.user_id).filter((value): value is string => Boolean(value)))];
  const courseOrderIds = [...new Set((refunds ?? []).map((refund) => refund.course_order_id).filter((value): value is string => Boolean(value)))];
  const psychometricOrderIds = [
    ...new Set((refunds ?? []).map((refund) => refund.psychometric_order_id).filter((value): value is string => Boolean(value))),
  ];

  const [profilesResult, courseOrdersResult, psychometricOrdersResult] = await Promise.all([
    userIds.length
      ? admin.data.from("profiles").select("id,full_name,email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    courseOrderIds.length
      ? admin.data.from("course_orders").select("id,gross_amount,currency,payment_status,paid_at").in("id", courseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    psychometricOrderIds.length
      ? admin.data.from("psychometric_orders").select("id,final_paid_amount,currency,payment_status,paid_at").in("id", psychometricOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const lookupsError = profilesResult.error || courseOrdersResult.error || psychometricOrdersResult.error;
  if (lookupsError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Refunds</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{lookupsError.message}</p>
      </div>
    );
  }

  const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const courseOrdersById = new Map((courseOrdersResult.data ?? []).map((order) => [order.id, order]));
  const psychometricOrdersById = new Map((psychometricOrdersResult.data ?? []).map((order) => [order.id, order]));

  const initialRefunds = (refunds ?? []).map((refund) => ({
    ...refund,
    user: profilesById.get(refund.user_id) ?? null,
    order:
      refund.order_kind === "course_enrollment"
        ? (() => {
            const order = refund.course_order_id ? courseOrdersById.get(refund.course_order_id) ?? null : null;
            return order
              ? {
                  ...order,
                  final_paid_amount: Number(order.gross_amount ?? 0),
                }
              : null;
          })()
        : (refund.psychometric_order_id ? psychometricOrdersById.get(refund.psychometric_order_id) ?? null : null),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Refunds</h1>
      <p className="mt-2 text-sm text-slate-600">
        Review requests, track payment details, record admin notes, and move refunds through approval and processing.
      </p>
      <AdminRefundsManagement initialRefunds={initialRefunds} />
    </div>
  );
}
