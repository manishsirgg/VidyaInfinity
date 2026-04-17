import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("razorpay_transactions")
    .select("id,order_type,amount,status,razorpay_payment_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Transactions</h1>
      <div className="mt-4 space-y-2">
        {transactions?.map((txn) => (
          <div key={txn.id} className="rounded border bg-white p-3 text-sm">
            {txn.order_type} · ₹{txn.amount} · {txn.status} · {txn.razorpay_payment_id}
          </div>
        ))}
      </div>
    </div>
  );
}
