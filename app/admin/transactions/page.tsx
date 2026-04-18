import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

function toTitleCase(value: string | null) {
  const raw = value ?? "unknown";
  return raw
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const [{ data: transactions }, { data: orders }, { data: enrollments }, { data: payouts }] = await Promise.all([
    supabase
      .from("razorpay_transactions")
      .select("id,order_type,amount,status,razorpay_payment_id,created_at,order_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("course_orders")
      .select("id,course_id,user_id,institute_id,payment_status,payout_status,gross_amount,platform_commission_amount,institute_receivable_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("course_enrollments")
      .select("id,user_id,course_id,institute_id,enrollment_status,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("institute_payouts")
      .select("id,institute_id,course_order_id,amount_payable,payout_status,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <section>
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <p className="mt-1 text-sm text-slate-600">Monitor payment captures, order records, enrollments, and payout state in one place.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Razorpay Transactions</h2>
        <div className="mt-3 space-y-2">
          {transactions?.map((txn) => (
            <div key={txn.id} className="rounded border bg-white p-3 text-sm">
              {txn.order_type} · ₹{txn.amount} · {toTitleCase(txn.status)} · Payment ID: {txn.razorpay_payment_id}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Course Orders</h2>
        <div className="mt-3 space-y-2">
          {orders?.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              Order {order.id.slice(0, 8)} · Course {order.course_id.slice(0, 8)} · Student {order.user_id.slice(0, 8)}
              <div className="text-slate-700">
                Payment: {toTitleCase(order.payment_status)} · Payout: {toTitleCase(order.payout_status)} · Gross ₹{order.gross_amount}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Course Enrollments</h2>
        <div className="mt-3 space-y-2">
          {enrollments?.map((enrollment) => (
            <div key={enrollment.id} className="rounded border bg-white p-3 text-sm">
              Enrollment {enrollment.id.slice(0, 8)} · Student {enrollment.user_id.slice(0, 8)} · Course {enrollment.course_id.slice(0, 8)} ·
              {" "}
              {toTitleCase(enrollment.enrollment_status)}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Institute Payouts</h2>
        <div className="mt-3 space-y-2">
          {payouts?.map((payout) => (
            <div key={payout.id} className="rounded border bg-white p-3 text-sm">
              Institute {payout.institute_id.slice(0, 8)} · ₹{payout.amount_payable} · {toTitleCase(payout.payout_status)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
