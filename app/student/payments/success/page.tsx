import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function PaymentSuccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { user } = await requireUser("student");
  const orderId = first(params.order_id) || first(params.razorpay_order_id);
  const paymentId = first(params.payment_id) || first(params.razorpay_payment_id);
  const kindRaw = first(params.kind).trim().toLowerCase();
  const kind = kindRaw === "webinar" || kindRaw === "psychometric" ? kindRaw : "course";

  let itemTitle: string | null = null;
  let amount: number | null = null;
  const kindTitle = kind === "webinar" ? "webinar" : kind === "psychometric" ? "psychometric test" : "course";

  if (orderId) {
    const supabase = await createClient();
    if (kind === "webinar") {
      const { data } = await supabase
        .from("webinar_orders")
        .select("amount,webinars(title)")
        .eq("student_id", user.id)
        .eq("razorpay_order_id", orderId)
        .maybeSingle<{ amount: number; webinars: { title: string | null } | { title: string | null }[] | null }>();
      amount = data?.amount ?? null;
      if (data?.webinars) itemTitle = Array.isArray(data.webinars) ? (data.webinars[0]?.title ?? null) : (data.webinars.title ?? null);
    } else if (kind === "psychometric") {
      const { data } = await supabase
        .from("psychometric_orders")
        .select("final_paid_amount,psychometric_tests(title)")
        .eq("user_id", user.id)
        .eq("razorpay_order_id", orderId)
        .maybeSingle<{ final_paid_amount: number; psychometric_tests: { title: string | null } | { title: string | null }[] | null }>();
      amount = data?.final_paid_amount ?? null;
      if (data?.psychometric_tests) {
        itemTitle = Array.isArray(data.psychometric_tests)
          ? (data.psychometric_tests[0]?.title ?? null)
          : (data.psychometric_tests.title ?? null);
      }
    } else {
      const { data } = await supabase
        .from("course_orders")
        .select("gross_amount,courses(title)")
        .eq("student_id", user.id)
        .eq("razorpay_order_id", orderId)
        .maybeSingle<{ gross_amount: number; courses: { title: string | null } | { title: string | null }[] | null }>();

      amount = data?.gross_amount ?? null;
      if (data?.courses) {
        itemTitle = Array.isArray(data.courses) ? (data.courses[0]?.title ?? null) : (data.courses.title ?? null);
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-emerald-700">
          {kind === "webinar" ? "Webinar payment successful" : "Payment successful"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {kind === "webinar"
            ? "Your webinar registration is confirmed and your access has been activated."
            : `Your ${kindTitle} purchase is confirmed and access is being activated.`}
        </p>

        <div className="mt-4 space-y-2 rounded bg-slate-50 p-4 text-sm text-slate-700">
          <p>{kind === "webinar" ? "Webinar" : "Item"}: {itemTitle ?? `Your selected ${kindTitle}`}</p>
          <p>Amount: {amount !== null ? `₹${amount}` : "-"}</p>
          <p>{kind === "webinar" ? "Webinar Order ID" : "Order ID"}: {orderId || "-"}</p>
          <p>{kind === "webinar" ? "Webinar Payment ID" : "Payment ID"}: {paymentId || "-"}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/student/dashboard" className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white">Student dashboard</Link>
          {kind === "webinar" ? (
            <>
              <Link href="/student/dashboard" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">My Webinar Registrations</Link>
              <Link href="/student/purchases" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Webinar Purchases</Link>
              <Link href="/webinars" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Browse Webinars</Link>
            </>
          ) : (
            <>
              <Link href="/student/enrollments" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">My enrollments</Link>
              <Link href="/student/purchases" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Purchases</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
