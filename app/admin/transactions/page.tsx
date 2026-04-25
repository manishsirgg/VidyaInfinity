import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";
import { calculateCanonicalPendingInstitutePayouts, calculateNetRevenue } from "@/lib/admin/finance-summary";

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

type AppPaymentTransaction = {
  id: string;
  source:
    | "razorpay_transactions"
    | "course_orders"
    | "webinar_orders"
    | "psychometric_orders"
    | "featured_listing_orders"
    | "course_featured_orders"
    | "webinar_featured_orders";
  status: string | null;
  amount: number | string | null;
  currency: string | null;
  createdAt: string | null;
  paidAt: string | null;
  orderRef: string | null;
  paymentRef: string | null;
  extra: string;
};

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

  const [
    transactionsResult,
    courseOrdersResult,
    webinarOrdersResult,
    psychometricOrdersResult,
    featuredListingOrdersResult,
    courseFeaturedOrdersResult,
    webinarFeaturedOrdersResult,
    enrollmentsResult,
    webinarRegistrationsResult,
    payoutsResult,
    payoutRequestsResult,
  ] = await Promise.all([
    supabase
      .from("razorpay_transactions")
      .select("id,order_kind,amount,payment_status,currency,razorpay_order_id,razorpay_payment_id,created_at,course_order_id,psychometric_order_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("course_orders")
      .select("id,course_id,student_id,institute_id,payment_status,payout_status,gross_amount,platform_fee_amount,institute_receivable_amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webinar_orders")
      .select("id,webinar_id,student_id,institute_id,payment_status,order_status,access_status,amount,platform_fee_amount,payout_amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("psychometric_orders")
      .select("id,user_id,test_id,payment_status,final_amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("featured_listing_orders")
      .select("id,institute_id,plan_id,payment_status,order_status,amount,final_payable_amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("course_featured_orders")
      .select("id,institute_id,course_id,plan_id,payment_status,order_status,amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webinar_featured_orders")
      .select("id,institute_id,webinar_id,plan_id,payment_status,order_status,amount,currency,razorpay_order_id,razorpay_payment_id,created_at,paid_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("course_enrollments")
      .select("id,student_id,course_id,institute_id,enrollment_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webinar_registrations")
      .select("id,webinar_id,student_id,registration_status,payment_status,access_status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("institute_payouts")
      .select("id,institute_id,course_order_id,webinar_order_id,payout_amount,payout_status,payout_source,gross_amount,platform_fee_amount,refund_amount,created_at,processed_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("institute_payout_requests")
      .select("id,institute_id,status,requested_amount,approved_amount,created_at,updated_at,paid_at")
      .limit(1000),
  ]);

  const pageError =
    transactionsResult.error ||
    courseOrdersResult.error ||
    webinarOrdersResult.error ||
    psychometricOrdersResult.error ||
    featuredListingOrdersResult.error ||
    courseFeaturedOrdersResult.error ||
    webinarFeaturedOrdersResult.error ||
    enrollmentsResult.error ||
    webinarRegistrationsResult.error ||
    payoutsResult.error ||
    payoutRequestsResult.error;

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
  const psychometricOrders = psychometricOrdersResult.data ?? [];
  const featuredListingOrders = featuredListingOrdersResult.data ?? [];
  const courseFeaturedOrders = courseFeaturedOrdersResult.data ?? [];
  const webinarFeaturedOrders = webinarFeaturedOrdersResult.data ?? [];
  const enrollments = enrollmentsResult.data ?? [];
  const webinarRegistrations = webinarRegistrationsResult.data ?? [];
  const payouts = payoutsResult.data ?? [];
  const payoutRequests = payoutRequestsResult.data ?? [];

  const webinarIds = [
    ...new Set([...webinarOrders, ...webinarRegistrations, ...webinarFeaturedOrders].map((item) => item.webinar_id).filter((value): value is string => Boolean(value))),
  ];

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

  const courseRevenue = calculateNetRevenue(orders as Record<string, unknown>[], "gross_amount");
  const webinarRevenue = calculateNetRevenue(webinarOrders as Record<string, unknown>[], "amount");
  const psychometricRevenue = calculateNetRevenue(psychometricOrders as Record<string, unknown>[], "final_amount");
  const instituteFeaturedRevenue = calculateNetRevenue(featuredListingOrders as Record<string, unknown>[], "final_payable_amount");
  const courseFeaturedRevenue = calculateNetRevenue(courseFeaturedOrders as Record<string, unknown>[], "amount");
  const webinarFeaturedRevenue = calculateNetRevenue(webinarFeaturedOrders as Record<string, unknown>[], "amount");
  const canonicalPendingPayouts = calculateCanonicalPendingInstitutePayouts({
    payoutLedgerRows: payouts as Record<string, unknown>[],
    payoutRequestRows: payoutRequests as Record<string, unknown>[],
  });

  const appPayments: AppPaymentTransaction[] = [
    ...transactions.map((row) => ({
      id: row.id,
      source: "razorpay_transactions" as const,
      status: row.payment_status,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: null,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `${toTitleCase(row.order_kind)} · course ${shortId(row.course_order_id)} · test ${shortId(row.psychometric_order_id)}`,
    })),
    ...orders.map((row) => ({
      id: row.id,
      source: "course_orders" as const,
      status: row.payment_status,
      amount: row.gross_amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `course ${shortId(row.course_id)} · student ${shortId(row.student_id)}`,
    })),
    ...webinarOrders.map((row) => ({
      id: row.id,
      source: "webinar_orders" as const,
      status: row.payment_status,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `webinar ${shortId(row.webinar_id)} · student ${shortId(row.student_id)}`,
    })),
    ...psychometricOrders.map((row) => ({
      id: row.id,
      source: "psychometric_orders" as const,
      status: row.payment_status,
      amount: row.final_amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `test ${shortId(row.test_id)} · user ${shortId(row.user_id)}`,
    })),
    ...featuredListingOrders.map((row) => ({
      id: row.id,
      source: "featured_listing_orders" as const,
      status: row.payment_status,
      amount: row.final_payable_amount ?? row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `institute ${shortId(row.institute_id)} · plan ${shortId(row.plan_id)} · ${toTitleCase(row.order_status)}`,
    })),
    ...courseFeaturedOrders.map((row) => ({
      id: row.id,
      source: "course_featured_orders" as const,
      status: row.payment_status,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `course ${shortId(row.course_id)} · institute ${shortId(row.institute_id)} · ${toTitleCase(row.order_status)}`,
    })),
    ...webinarFeaturedOrders.map((row) => ({
      id: row.id,
      source: "webinar_featured_orders" as const,
      status: row.payment_status,
      amount: row.amount,
      currency: row.currency,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      orderRef: row.razorpay_order_id,
      paymentRef: row.razorpay_payment_id,
      extra: `webinar ${shortId(row.webinar_id)} · institute ${shortId(row.institute_id)} · ${toTitleCase(row.order_status)}`,
    })),
  ].sort((a, b) => {
    const aDate = new Date(a.paidAt ?? a.createdAt ?? 0).getTime();
    const bDate = new Date(b.paidAt ?? b.createdAt ?? 0).getTime();
    return bDate - aDate;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <section>
        <h1 className="text-2xl font-semibold">Admin Transactions</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/admin/dashboard" className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Back to Dashboard</Link>
          <Link href="/admin/refunds" className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700">View Refunds</Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">Monitor all payment transactions throughout the app, plus related orders, enrollments, registrations, and payouts.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Course revenue (net)</p><p className="text-lg font-semibold">{formatAmount(courseRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Webinar revenue (net)</p><p className="text-lg font-semibold">{formatAmount(webinarRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Psychometric revenue (net)</p><p className="text-lg font-semibold">{formatAmount(psychometricRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Course featured listing revenue</p><p className="text-lg font-semibold">{formatAmount(courseFeaturedRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Webinar featured promotion revenue</p><p className="text-lg font-semibold">{formatAmount(webinarFeaturedRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Institute featured listing revenue</p><p className="text-lg font-semibold">{formatAmount(instituteFeaturedRevenue.net)}</p></div>
          <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Pending institute payouts / net payable</p><p className="text-lg font-semibold">{formatAmount(canonicalPendingPayouts.totalPayable)}</p></div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">All Payment Transactions</h2>
        <p className="mt-1 text-xs text-slate-500">Merged view across Razorpay transactions, course/webinar/test orders, and featured order payments.</p>
        <div className="mt-3 space-y-2">
          {appPayments.map((txn) => (
            <div key={`${txn.source}-${txn.id}`} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">
                {toTitleCase(txn.source)} · {formatAmount(txn.amount, txn.currency ?? "INR")} · {toTitleCase(txn.status)}
              </p>
              <p className="text-slate-700">{txn.extra}</p>
              <p className="text-xs text-slate-500">
                Payment ID: {txn.paymentRef ?? "-"} · Order ID: {txn.orderRef ?? "-"} · Paid {toDateTimeLabel(txn.paidAt)} · Created {toDateTimeLabel(txn.createdAt)}
              </p>
            </div>
          ))}
          {appPayments.length === 0 ? <p className="rounded border border-dashed bg-white p-3 text-sm text-slate-600">No payment transactions found.</p> : null}
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
