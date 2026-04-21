import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

type CoursePurchase = {
  id: string;
  gross_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  course_id: string;
  courses: { title: string | null } | { title: string | null }[] | null;
};

type PsychometricPurchase = {
  id: string;
  final_paid_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  test_id: string;
};

type WebinarPurchase = {
  id: string;
  webinar_id: string;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  order_status: string | null;
};

const SUCCESS_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"];

function extractCourseTitle(order: CoursePurchase) {
  if (!order.courses) return order.course_id;
  if (Array.isArray(order.courses)) return order.courses[0]?.title ?? order.course_id;
  return order.courses.title ?? order.course_id;
}

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const [courseResult, testResult, webinarResult] = await Promise.all([
    supabase
      .from("course_orders")
      .select("id,gross_amount,payment_status,paid_at,course_id,courses(title)")
      .eq("student_id", user.id)
      .in("payment_status", SUCCESS_PAYMENT_STATUSES)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("psychometric_orders")
      .select("id,final_paid_amount,payment_status,paid_at,test_id")
      .eq("user_id", user.id)
      .in("payment_status", SUCCESS_PAYMENT_STATUSES)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("webinar_orders")
      .select("id,webinar_id,amount,currency,payment_status,paid_at,order_status")
      .eq("student_id", user.id)
      .in("payment_status", SUCCESS_PAYMENT_STATUSES)
      .in("order_status", ["confirmed", "paid", "success"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const courseOrders = (courseResult.data ?? []) as CoursePurchase[];
  const testOrders = (testResult.data ?? []) as PsychometricPurchase[];
  const webinarOrders = (webinarResult.data ?? []) as WebinarPurchase[];

  const webinarIds = Array.from(new Set(webinarOrders.map((order) => order.webinar_id).filter(Boolean)));
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

  const loadErrors = [courseResult.error, testResult.error, webinarResult.error].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Purchases</h1>
      <p className="mt-2 text-sm text-slate-600">Showing confirmed purchases only (paid/captured/confirmed).</p>

      {loadErrors.length > 0 ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          We could not load all purchase records right now. Please refresh or contact support if this persists.
        </div>
      ) : null}

      <h2 className="mt-6 font-medium">Course Orders</h2>
      <div className="mt-2 space-y-2">
        {courseOrders.length === 0 ? (
          <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No confirmed course purchases found yet.</p>
        ) : (
          courseOrders.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              {extractCourseTitle(order)} · ₹{order.gross_amount} · {order.payment_status}
              <RefundRequestButton orderType="course" orderId={order.id} />
            </div>
          ))
        )}
      </div>

      <h2 className="mt-6 font-medium">Psychometric Orders</h2>
      <div className="mt-2 space-y-2">
        {testOrders.length === 0 ? (
          <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No confirmed psychometric purchases found yet.</p>
        ) : (
          testOrders.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              {order.test_id} · ₹{order.final_paid_amount} · {order.payment_status}
              <RefundRequestButton orderType="psychometric" orderId={order.id} />
            </div>
          ))
        )}
      </div>

      <h2 className="mt-6 font-medium">Webinar Orders</h2>
      <div className="mt-2 space-y-2">
        {webinarOrders.length === 0 ? (
          <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No confirmed webinar purchases found yet.</p>
        ) : (
          webinarOrders.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              {webinarTitles.get(order.webinar_id) ?? order.webinar_id} · {order.currency ?? "INR"} {order.amount} · {order.payment_status}
              {order.order_status ? ` · ${order.order_status}` : ""}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
