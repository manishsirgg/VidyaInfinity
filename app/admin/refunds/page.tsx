import { RefundStatusActions } from "@/components/admin/refund-status-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: refunds } = await supabase.from("refunds").select("*").order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Refunds</h1>
      <div className="mt-4 space-y-2">
        {refunds?.map((refund) => (
          <div key={refund.id} className="rounded border bg-white p-3 text-sm">
            <p>
              {refund.order_type} · {refund.status} · user {refund.user_id}
            </p>
            <p className="text-xs">Reason: {refund.reason}</p>
            <RefundStatusActions refundId={refund.id} currentStatus={refund.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
