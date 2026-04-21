import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

type CoursePurchase = {
  id: string;
  gross_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  course_id: string;
  created_at: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
};

type EnrollmentRow = {
  course_order_id: string | null;
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

const SUCCESS_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;
const SUCCESS_PAYMENT_STATUSES_SET = new Set<string>(SUCCESS_PAYMENT_STATUSES);

function isConfirmedPayment(status: string | null | undefined, paidAt?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (SUCCESS_PAYMENT_STATUSES_SET.has(normalized)) return true;
  return Boolean(paidAt);
}

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const [courseResult, testResult, webinarResult] = await Promise.all([
    supabase
      .from("course_orders")
      .select("id,gross_amount,payment_status,paid_at,created_at,course_id,razorpay_payment_id,razorpay_signature")
      .eq("student_id", user.id)
      .order("paid_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("psychometric_orders")
      .select("id,final_paid_amount,payment_status,paid_at,test_id")
      .eq("user_id", user.id)
      .in("payment_status", [...SUCCESS_PAYMENT_STATUSES])
      .order("paid_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("webinar_orders")
      .select("id,webinar_id,amount,currency,payment_status,paid_at,order_status")
      .eq("student_id", user.id)
      .in("payment_status", [...SUCCESS_PAYMENT_STATUSES])
      .in("order_status", ["confirmed", "paid", "success"])
      .order("paid_at", { ascending: false, nullsFirst: false }),
  ]);


  if (courseResult.error || testResult.error || webinarResult.error) {
    console.error("[student/purchases] order fetch failed", {
      user_id: user.id,
      courseError: courseResult.error?.message ?? null,
      psychometricError: testResult.error?.message ?? null,
      webinarError: webinarResult.error?.message ?? null,
    });
  }

  const courseOrders = (courseResult.data ?? []) as CoursePurchase[];
  const testOrders = (testResult.data ?? []) as PsychometricPurchase[];
  const webinarOrders = (webinarResult.data ?? []) as WebinarPurchase[];
  const [enrollmentResult] = await Promise.all([
    supabase
      .from("course_enrollments")
      .select("course_order_id")
      .eq("student_id", user.id)
      .in("enrollment_status", ["pending", "active", "suspended", "completed", "enrolled"]),
  ]);

  if (enrollmentResult.error) {
    console.error("[student/purchases] enrollment fetch failed", { user_id: user.id, error: enrollmentResult.error.message });
  }

  const enrolledOrderIds = new Set(
    ((enrollmentResult.data ?? []) as EnrollmentRow[])
      .map((row) => row.course_order_id)
      .filter((id): id is string => Boolean(id))
  );
  const confirmedCourseOrders = courseOrders.filter((order) => {
    if (enrolledOrderIds.has(order.id)) return true;
    return isConfirmedPayment(order.payment_status, order.paid_at) || Boolean(order.razorpay_payment_id && order.razorpay_signature);
  });

  console.info("[student/purchases] normalized course decisions", {
    user_id: user.id,
    totalCourseOrders: courseOrders.length,
    confirmedCourseOrders: confirmedCourseOrders.length,
  });

  const courseIds = Array.from(new Set(confirmedCourseOrders.map((order) => order.course_id).filter(Boolean)));
  const courseTitles = new Map<string, string>();

  if (courseIds.length > 0) {
    const { data: courses, error: coursesError } = await supabase.from("courses").select("id,title").in("id", courseIds);
    if (coursesError) {
      console.error("[student/purchases] course title fetch failed", { user_id: user.id, error: coursesError.message });
    }
    for (const course of courses ?? []) {
      courseTitles.set(course.id, course.title ?? course.id);
    }
  }

  const webinarIds = Array.from(new Set(webinarOrders.map((order) => order.webinar_id).filter(Boolean)));
  const webinarTitles = new Map<string, string>();

  if (webinarIds.length > 0) {
    const { data: webinars, error: webinarsError } = await supabase
      .from("webinars")
      .select("id,title")
      .in("id", webinarIds);

    if (webinarsError) {
      console.error("[student/purchases] webinar title fetch failed", { user_id: user.id, error: webinarsError.message });
    }

    for (const webinar of webinars ?? []) {
      webinarTitles.set(webinar.id, webinar.title ?? webinar.id);
    }
  }

  const loadErrors = [courseResult.error, testResult.error, webinarResult.error, enrollmentResult.error].filter(Boolean);

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
        {confirmedCourseOrders.length === 0 ? (
          <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No confirmed course purchases found yet.</p>
        ) : (
          confirmedCourseOrders.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              {courseTitles.get(order.course_id) ?? order.course_id} · ₹{order.gross_amount} · {order.payment_status ?? "paid"}
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
