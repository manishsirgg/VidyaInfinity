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

  let courseTitle: string | null = null;
  let amount: number | null = null;

  if (orderId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("course_orders")
      .select("gross_amount,courses(title)")
      .eq("student_id", user.id)
      .eq("razorpay_order_id", orderId)
      .maybeSingle<{ gross_amount: number; courses: { title: string | null } | { title: string | null }[] | null }>();

    amount = data?.gross_amount ?? null;
    if (data?.courses) {
      courseTitle = Array.isArray(data.courses) ? (data.courses[0]?.title ?? null) : (data.courses.title ?? null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-emerald-700">Payment successful</h1>
        <p className="mt-2 text-sm text-slate-600">Your course purchase is confirmed and enrollment is being activated.</p>

        <div className="mt-4 space-y-2 rounded bg-slate-50 p-4 text-sm text-slate-700">
          <p>Course: {courseTitle ?? "Your selected course"}</p>
          <p>Amount: {amount !== null ? `₹${amount}` : "-"}</p>
          <p>Order ID: {orderId || "-"}</p>
          <p>Payment ID: {paymentId || "-"}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/student/dashboard" className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white">Student dashboard</Link>
          <Link href="/student/enrollments" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">My enrollments</Link>
          <Link href="/student/purchases" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Purchases</Link>
        </div>
      </div>
    </div>
  );
}
