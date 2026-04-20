import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from("razorpay_transactions")
    .select("id,order_type,amount,status,razorpay_payment_id,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Payments</h1>
      <div className="mt-4 space-y-2">
        {transactions?.map((txn) => (
          <div key={txn.id} className="rounded border bg-white p-3 text-sm">
            {txn.order_type} · ₹{txn.amount} · {txn.status}
          </div>
        ))}
      </div>
    </div>
  );
}
