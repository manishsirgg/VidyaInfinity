import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

function toTitleCase(value: string | null) {
  const raw = value ?? "unknown";
  return raw
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 8);
}

function formatAmount(value: number | string | null | undefined, currency = "INR") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return toCurrency(0, currency);
  return toCurrency(amount, currency);
}

export default async function Page() {
  await requireUser("admin");

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{admin.error}</p>
      </div>
    );
  }

  const supabase = admin.data;

  const [transactionsResult, courseOrdersResult, webinarOrdersResult, enrollmentsResult, webinarRegistrationsResult, payoutsResult] = await Promise.all([
    supabase
      .from("razorpay_transactions")
      .select("id,order_kind,amount,payment_status,razorpay_order_id,razorpay_payment_id,created_at,course_order_id,psychometric_order_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("course_orders")
      .select("id,course_id,student_id,institute_id,payment_status,payout_status,gross_amount,platform_fee_amount,institute_receivable_amount,currency,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webinar_orders")
      .select("id,webinar_id,student_id,institute_id,payment_status,order_status,access_status,amount,platform_fee_amount,payout_amount,currency,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("course_enrollments")
      .select("id,student_id,course_id,institute_id,enrollment_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webinar_registrations")
      .select("id,webinar_id,student_id,institute_id,registration_status,payment_status,access_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("institute_payouts")
      .select("id,institute_id,course_order_id,webinar_order_id,payout_amount,payout_status,created_at,processed_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const pageError =
    transactionsResult.error ||
    courseOrdersResult.error ||
    webinarOrdersResult.error ||
    enrollmentsResult.error ||
    webinarRegistrationsResult.error ||
    payoutsResult.error;

  if (pageError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Could not load transactions: {pageError.message}</p>
      </div>
    );
  }

  const transactions = transactionsResult.data ?? [];
  const orders = courseOrdersResult.data ?? [];
  const webinarOrders = webinarOrdersResult.data ?? [];
  const enrollments = enrollmentsResult.data ?? [];
  const webinarRegistrations = webinarRegistrationsResult.data ?? [];
  const payouts = payoutsResult.data ?? [];

  const webinarIds = [...new Set([...webinarOrders, ...webinarRegistrations].map((item) => item.webinar_id).filter((value): value is string => Boolean(value)))];

  const { data: webinarRows, error: webinarsError } = webinarIds.length
    ? await supabase.from("webinars").select("id,title,starts_at,webinar_mode,status").in("id", webinarIds)
    : { data: [], error: null };

  if (webinarsError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Could not load webinar details: {webinarsError.message}</p>
      </div>
    );
  }

  const webinarById = new Map((webinarRows ?? []).map((webinar) => [webinar.id, webinar]));

  const totalCourseRevenue = orders
    .filter((row) => row.payment_status === "paid")
    .reduce((sum, row) => sum + Number(row.gross_amount ?? 0), 0);
  const totalWebinarRevenue = webinarOrders
    .filter((row) => row.payment_status === "paid")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const pendingPayoutTotal = payouts
    .filter((row) => row.payout_status !== "processed")
    .reduce((sum, row) => sum + Number(row.payout_amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <section>
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <p className="mt-1 text-sm text-slate-600">Monitor payment captures, order records, enrollments, webinar sales, and payout state in one place.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border bg-white p-3">
            <p className="text-xs text-slate-500">Course revenue (paid)</p>
            <p className="text-lg font-semibold">{formatAmount(totalCourseRevenue)}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-xs text-slate-500">Webinar revenue (paid)</p>
            <p className="text-lg font-semibold">{formatAmount(totalWebinarRevenue)}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-xs text-slate-500">Pending institute payouts</p>
            <p className="text-lg font-semibold">{formatAmount(pendingPayoutTotal)}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-xs text-slate-500">Payment captures tracked</p>
            <p className="text-lg font-semibold">{transactions.length}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Razorpay Transactions</h2>
        <div className="mt-3 space-y-2">
          {transactions.map((txn) => (
            <div key={txn.id} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">{toTitleCase(txn.order_kind)} · {formatAmount(txn.amount)} · {toTitleCase(txn.payment_status)}</p>
              <p className="text-slate-600">Payment ID: {txn.razorpay_payment_id ?? "-"} · Order ID: {txn.razorpay_order_id ?? "-"}</p>
              <p className="text-xs text-slate-500">Created {toDateTimeLabel(txn.created_at)} · Course Order {shortId(txn.course_order_id)} · Test Order {shortId(txn.psychometric_order_id)}</p>
            </div>
          ))}
          {transactions.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No Razorpay transactions found.</p> : null}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Course Orders</h2>
          <Link href="/admin/courses" className="text-sm text-brand-700">Review courses</Link>
        </div>
        <div className="mt-3 space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">Order {shortId(order.id)} · Course {shortId(order.course_id)} · Student {shortId(order.student_id)}</p>
              <p className="text-slate-700">
                Payment: {toTitleCase(order.payment_status)} · Payout: {toTitleCase(order.payout_status)} · Gross {formatAmount(order.gross_amount, order.currency ?? "INR")}
              </p>
              <p className="text-xs text-slate-500">Platform fee {formatAmount(order.platform_fee_amount, order.currency ?? "INR")} · Institute receivable {formatAmount(order.institute_receivable_amount, order.currency ?? "INR")} · Paid at {toDateTimeLabel(order.paid_at)}</p>
            </div>
          ))}
          {orders.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No course orders found.</p> : null}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Webinar Orders (with webinar details)</h2>
          <Link href="/admin/webinars" className="text-sm text-brand-700">Review webinars</Link>
        </div>
        <div className="mt-3 space-y-2">
          {webinarOrders.map((order) => {
            const webinar = webinarById.get(order.webinar_id);
            return (
              <div key={order.id} className="rounded border bg-white p-3 text-sm">
                <p className="font-medium">Order {shortId(order.id)} · {webinar?.title ?? `Webinar ${shortId(order.webinar_id)}`}</p>
                <p className="text-slate-700">
                  Payment: {toTitleCase(order.payment_status)} · Access: {toTitleCase(order.access_status)} · {formatAmount(order.amount, order.currency ?? "INR")}
                </p>
                <p className="text-xs text-slate-500">
                  Status: {toTitleCase(order.order_status)} · Mode: {toTitleCase(webinar?.webinar_mode ?? "unknown")} · Webinar status: {toTitleCase(webinar?.status ?? "unknown")}
                </p>
                <p className="text-xs text-slate-500">
                  Starts: {toDateTimeLabel(webinar?.starts_at ?? null)} · Paid at {toDateTimeLabel(order.paid_at)} · Created {toDateTimeLabel(order.created_at)}
                </p>
              </div>
            );
          })}
          {webinarOrders.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No webinar orders found.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Course Enrollments</h2>
        <div className="mt-3 space-y-2">
          {enrollments.map((enrollment) => (
            <div key={enrollment.id} className="rounded border bg-white p-3 text-sm">
              Enrollment {shortId(enrollment.id)} · Student {shortId(enrollment.student_id)} · Course {shortId(enrollment.course_id)} · {toTitleCase(enrollment.enrollment_status)}
            </div>
          ))}
          {enrollments.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No course enrollments found.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Webinar Registrations</h2>
        <div className="mt-3 space-y-2">
          {webinarRegistrations.map((registration) => {
            const webinar = webinarById.get(registration.webinar_id);
            return (
              <div key={registration.id} className="rounded border bg-white p-3 text-sm">
                <p className="font-medium">Registration {shortId(registration.id)} · Student {shortId(registration.student_id)} · {webinar?.title ?? `Webinar ${shortId(registration.webinar_id)}`}</p>
                <p className="text-slate-700">
                  Status: {toTitleCase(registration.registration_status)} · Payment: {toTitleCase(registration.payment_status)} · Access: {toTitleCase(registration.access_status)}
                </p>
                <p className="text-xs text-slate-500">Webinar starts {toDateTimeLabel(webinar?.starts_at ?? null)} · Created {toDateTimeLabel(registration.created_at)}</p>
              </div>
            );
          })}
          {webinarRegistrations.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No webinar registrations found.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Institute Payouts</h2>
        <div className="mt-3 space-y-2">
          {payouts.map((payout) => (
            <div key={payout.id} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">Institute {shortId(payout.institute_id)} · {formatAmount(payout.payout_amount)} · {toTitleCase(payout.payout_status)}</p>
              <p className="text-xs text-slate-500">Course Order {shortId(payout.course_order_id)} · Webinar Order {shortId(payout.webinar_order_id)} · Processed {toDateTimeLabel(payout.processed_at)}</p>
            </div>
          ))}
          {payouts.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No institute payouts found.</p> : null}
        </div>
      </section>
    </div>
  );
}
