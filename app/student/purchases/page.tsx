import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const { data: courseOrders } = await supabase
    .from("course_orders")
    .select("id,gross_amount,payment_status,paid_at,course_id")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const { data: testOrders } = await supabase
    .from("psychometric_orders")
    .select("id,final_paid_amount,payment_status,paid_at,test_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: webinarOrders } = await supabase
    .from("webinar_orders")
    .select("id,webinar_id,amount,currency,payment_status,paid_at,order_status")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const webinarIds = Array.from(new Set((webinarOrders ?? []).map((order) => order.webinar_id).filter(Boolean)));
  const webinarTitles = new Map<string, string>();
  if (webinarIds.length > 0) {
    const { data: webinars } = await supabase
      .from("webinars")
      .select("id,title")
      .in("id", webinarIds);
    for (const webinar of webinars ?? []) {
      webinarTitles.set(webinar.id, webinar.title ?? webinar.id);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Purchases</h1>
      <h2 className="mt-6 font-medium">Course Orders</h2>
      <div className="mt-2 space-y-2">
        {courseOrders?.map((order) => (
          <div key={order.id} className="rounded border bg-white p-3 text-sm">
            {order.course_id} · ₹{order.gross_amount} · {order.payment_status}
            {order.payment_status === "paid" && <RefundRequestButton orderType="course" orderId={order.id} />}
          </div>
        ))}
      </div>
      <h2 className="mt-6 font-medium">Psychometric Orders</h2>
      <div className="mt-2 space-y-2">
        {testOrders?.map((order) => (
          <div key={order.id} className="rounded border bg-white p-3 text-sm">
            {order.test_id} · ₹{order.final_paid_amount} · {order.payment_status}
            {order.payment_status === "paid" && <RefundRequestButton orderType="psychometric" orderId={order.id} />}
          </div>
        ))}
      </div>
      <h2 className="mt-6 font-medium">Webinar Orders</h2>
      <div className="mt-2 space-y-2">
        {webinarOrders?.map((order) => (
          <div key={order.id} className="rounded border bg-white p-3 text-sm">
            {webinarTitles.get(order.webinar_id) ?? order.webinar_id} · {order.currency ?? "INR"} {order.amount} · {order.payment_status}
            {order.order_status ? ` · ${order.order_status}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
