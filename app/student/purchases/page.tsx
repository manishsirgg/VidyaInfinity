import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const { data: courseOrders } = await supabase
    .from("course_orders")
    .select("id,final_paid_amount,payment_status,paid_at,course_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: testOrders } = await supabase
    .from("psychometric_orders")
    .select("id,final_paid_amount,payment_status,paid_at,test_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Purchases</h1>
      <h2 className="mt-6 font-medium">Course Orders</h2>
      <div className="space-y-2 mt-2">
        {courseOrders?.map((order) => (
          <div key={order.id} className="rounded border bg-white p-3 text-sm">
            {order.course_id} · ₹{order.final_paid_amount} · {order.payment_status}
          </div>
        ))}
      </div>
      <h2 className="mt-6 font-medium">Psychometric Orders</h2>
      <div className="space-y-2 mt-2">
        {testOrders?.map((order) => (
          <div key={order.id} className="rounded border bg-white p-3 text-sm">
            {order.test_id} · ₹{order.final_paid_amount} · {order.payment_status}
          </div>
        ))}
      </div>
    </div>
  );
}
