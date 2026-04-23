import Link from "next/link";

import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CoursePurchase = {
  id: string;
  gross_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  course_id: string;
  created_at: string | null;
  razorpay_payment_id: string | null;
};

type EnrollmentRow = {
  course_id: string | null;
  course_order_id: string | null;
  enrollment_status?: string | null;
};

type PsychometricPurchase = {
  id: string;
  final_paid_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  test_id: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  created_at?: string | null;
};

type WebinarPurchase = {
  id: string;
  webinar_id: string;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  order_status: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  created_at?: string | null;
};

type WebinarRegistration = {
  id: string;
  webinar_order_id: string | null;
  webinar_id: string;
  created_at?: string | null;
  registered_at?: string | null;
  registration_status: string | null;
  payment_status: string | null;
  access_status: string | null;
  access_start_at: string | null;
  access_end_at: string | null;
  webinars:
    | {
        title: string | null;
        starts_at: string | null;
        meeting_url: string | null;
        webinar_mode: string | null;
        meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        title: string | null;
        starts_at: string | null;
        meeting_url: string | null;
        webinar_mode: string | null;
        meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

type RefundRecord = {
  id: string;
  refund_status: "requested" | "processing" | "refunded" | "failed" | "cancelled";
  order_kind: "course_enrollment" | "psychometric_test" | "webinar";
  reason: string | null;
  amount: number | null;
  requested_at: string | null;
  created_at: string | null;
  razorpay_payment_id: string | null;
  course_order_id: string | null;
  psychometric_order_id: string | null;
  webinar_order_id: string | null;
};

type PurchaseKindFilter = "all" | "course" | "webinar" | "webinar-refunds" | "psychometric";

type TabConfig = {
  label: string;
  href: string;
  value: PurchaseKindFilter;
};

const SUCCESS_PAYMENT_STATUSES = ["paid", "captured", "success", "confirmed"] as const;
const SUCCESS_PAYMENT_STATUSES_SET = new Set<string>(SUCCESS_PAYMENT_STATUSES);
const ENROLLMENT_STATUSES_VISIBLE = ["enrolled", "pending", "active", "suspended", "completed"] as const;
const PURCHASE_TABS: TabConfig[] = [
  { label: "All", href: "/student/purchases", value: "all" },
  { label: "Course Orders", href: "/student/purchases?kind=course", value: "course" },
  { label: "Webinar Orders", href: "/student/purchases?kind=webinar", value: "webinar" },
  { label: "Webinar Refunds", href: "/student/purchases?kind=webinar-refunds", value: "webinar-refunds" },
  { label: "Psychometric Orders", href: "/student/purchases?kind=psychometric", value: "psychometric" },
];

function getPurchaseKindFilter(value: string | string[] | undefined): PurchaseKindFilter {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "course" || normalized === "webinar" || normalized === "webinar-refunds" || normalized === "psychometric") return normalized;
  return "all";
}

function isConfirmedPayment(status: string | null | undefined, paidAt?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (SUCCESS_PAYMENT_STATUSES_SET.has(normalized)) return true;
  return Boolean(paidAt);
}

function formatRupees(value: number | null | undefined, currency: string = "INR") {
  if (typeof value !== "number") return `${currency} --`;
  if (currency.toUpperCase() === "INR") {
    return `₹${value.toLocaleString("en-IN")}`;
  }
  return `${currency.toUpperCase()} ${value.toLocaleString("en-IN")}`;
}

function toTitleCase(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function RefundStatusBadge({ status }: { status: RefundRecord["refund_status"] }) {
  const tones: Record<RefundRecord["refund_status"], string> = {
    requested: "border-amber-200 bg-amber-50 text-amber-700",
    processing: "border-sky-200 bg-sky-50 text-sky-700",
    refunded: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tones[status]}`}>
      Refund {toTitleCase(status, "Requested")}
    </span>
  );
}

function webinarJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function registrationScore(item: WebinarRegistration) {
  const registrationStatus = String(item.registration_status ?? "").toLowerCase();
  const paymentStatus = String(item.payment_status ?? "").toLowerCase();
  const accessStatus = String(item.access_status ?? "").toLowerCase();
  let score = 0;
  if (registrationStatus === "registered") score += 4;
  else if (registrationStatus === "pending") score += 1;
  if (paymentStatus === "paid") score += 3;
  if (accessStatus === "granted") score += 5;
  return score;
}

function toRegistrationTimestamp(value: WebinarRegistration) {
  const source = value.registered_at ?? value.created_at;
  const parsed = source ? new Date(source).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickBestRegistrationForOrder(orderId: string, scoped: WebinarRegistration[]) {
  if (scoped.length === 0) return null;
  const exact = scoped.find((item) => item.webinar_order_id === orderId);
  if (exact) return exact;
  return [...scoped].sort((a, b) => {
    const scoreDiff = registrationScore(b) - registrationScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return toRegistrationTimestamp(b) - toRegistrationTimestamp(a);
  })[0] ?? null;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ kind?: string | string[] }>;
}) {
  const { user } = await requireUser("student");
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const resolvedParams = searchParams ? await searchParams : undefined;
  const purchaseKind = getPurchaseKindFilter(resolvedParams?.kind);

  const [courseResult, testResult, webinarResult] = await Promise.all([
    dataClient
      .from("course_orders")
      .select("id,gross_amount,payment_status,paid_at,created_at,course_id,razorpay_payment_id")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("psychometric_orders")
      .select("id,final_paid_amount,payment_status,paid_at,test_id,razorpay_order_id,razorpay_payment_id,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("webinar_orders")
      .select("id,webinar_id,amount,currency,payment_status,paid_at,order_status,razorpay_order_id,razorpay_payment_id,created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (courseResult.error || testResult.error || webinarResult.error) {
    console.error("[student/purchases] purchases_page_course_orders_failed", {
      event: "purchases_page_course_orders_failed",
      user_id: user.id,
      courseError: courseResult.error?.message ?? null,
      psychometricError: testResult.error?.message ?? null,
      webinarError: webinarResult.error?.message ?? null,
    });
  }

  const courseOrders = (courseResult.data ?? []) as CoursePurchase[];
  const testOrders = (testResult.data ?? []) as PsychometricPurchase[];
  const webinarOrders = (webinarResult.data ?? []) as WebinarPurchase[];

  const [webinarRegistrationsResult, refundsResult] = await Promise.all([
    dataClient
      .from("webinar_registrations")
      .select(
        "id,webinar_order_id,webinar_id,created_at,registered_at,registration_status,payment_status,access_status,access_start_at,access_end_at,webinars(title,starts_at,meeting_url,webinar_mode,meeting_provider,institutes(name))",
      )
      .eq("student_id", user.id)
      .returns<WebinarRegistration[]>(),
    dataClient
      .from("refunds")
      .select("id,refund_status,order_kind,reason,amount,requested_at,created_at,razorpay_payment_id,course_order_id,psychometric_order_id,webinar_order_id")
      .eq("user_id", user.id)
      .returns<RefundRecord[]>(),
  ]);

  const enrollmentWithStatus = await dataClient
    .from("course_enrollments")
    .select("course_id,course_order_id,enrollment_status")
    .eq("student_id", user.id)
    .in("enrollment_status", [...ENROLLMENT_STATUSES_VISIBLE]);

  const enrollmentResult =
    enrollmentWithStatus.error && enrollmentWithStatus.error.message.toLowerCase().includes("enrollment_status")
      ? await dataClient.from("course_enrollments").select("course_id,course_order_id").eq("student_id", user.id)
      : enrollmentWithStatus;

  if (enrollmentResult.error) {
    console.error("[student/purchases] enrollment fetch failed", { user_id: user.id, error: enrollmentResult.error.message });
  }

  const enrollmentRows = (enrollmentResult.data ?? []) as EnrollmentRow[];
  const enrolledOrderIds = new Set(enrollmentRows.map((row) => row.course_order_id).filter((id): id is string => Boolean(id)));
  const enrolledCourseIds = new Set(enrollmentRows.map((row) => row.course_id).filter((id): id is string => Boolean(id)));
  const enrollmentStatusByOrderId = new Map(
    enrollmentRows.filter((row) => row.course_order_id).map((row) => [row.course_order_id as string, row.enrollment_status ?? null]),
  );

  const confirmedCourseOrders = courseOrders.filter((order) => {
    if (enrolledOrderIds.has(order.id)) return true;
    if (enrolledCourseIds.has(order.course_id)) return true;
    return isConfirmedPayment(order.payment_status, order.paid_at) || Boolean(order.razorpay_payment_id);
  });

  const courseIds = Array.from(new Set(courseOrders.map((order) => order.course_id).filter(Boolean)));
  const courseTitles = new Map<string, string>();

  if (courseIds.length > 0) {
    const { data: courses, error: coursesError } = await dataClient.from("courses").select("id,title").in("id", courseIds);
    if (coursesError) {
      console.error("[student/purchases] course title fetch failed", { user_id: user.id, error: coursesError.message });
    }
    for (const course of courses ?? []) {
      courseTitles.set(course.id, course.title ?? course.id);
    }
  }

  const webinarIds = Array.from(new Set(webinarOrders.map((order) => order.webinar_id).filter(Boolean)));
  const webinarDetails = new Map<string, { title: string; startsAt: string | null; webinarMode: string | null }>();
  const testIds = Array.from(new Set(testOrders.map((order) => order.test_id).filter(Boolean)));
  const testTitles = new Map<string, string>();

  if (webinarIds.length > 0) {
    const { data: webinars, error: webinarsError } = await dataClient.from("webinars").select("id,title,starts_at,webinar_mode").in("id", webinarIds);

    if (webinarsError) {
      console.error("[student/purchases] webinar title fetch failed", { user_id: user.id, error: webinarsError.message });
    }

    for (const webinar of webinars ?? []) {
      webinarDetails.set(webinar.id, {
        title: webinar.title ?? webinar.id,
        startsAt: webinar.starts_at ?? null,
        webinarMode: webinar.webinar_mode ?? null,
      });
    }
  }

  if (testIds.length > 0) {
    const { data: tests, error: testsError } = await dataClient.from("psychometric_tests").select("id,title").in("id", testIds);
    if (testsError) {
      console.error("[student/purchases] psychometric title fetch failed", { user_id: user.id, error: testsError.message });
    }
    for (const test of tests ?? []) {
      testTitles.set(test.id, test.title ?? test.id);
    }
  }

  const webinarRegistrations = webinarRegistrationsResult.data ?? [];
  const refunds = refundsResult.data ?? [];
  const webinarRegistrationByOrderId = new Map<string, WebinarRegistration>(
    webinarRegistrations.filter((item) => item.webinar_order_id).map((item) => [item.webinar_order_id as string, item]),
  );
  const webinarRegistrationsByWebinarId = new Map<string, WebinarRegistration[]>();
  for (const registration of webinarRegistrations) {
    const key = registration.webinar_id;
    const current = webinarRegistrationsByWebinarId.get(key) ?? [];
    current.push(registration);
    webinarRegistrationsByWebinarId.set(key, current);
  }
  const courseRefundByOrderId = new Map(refunds.filter((refund) => refund.course_order_id).map((refund) => [refund.course_order_id as string, refund]));
  const psychometricRefundByOrderId = new Map(
    refunds.filter((refund) => refund.psychometric_order_id).map((refund) => [refund.psychometric_order_id as string, refund]),
  );
  const webinarRefundByOrderId = new Map(refunds.filter((refund) => refund.webinar_order_id).map((refund) => [refund.webinar_order_id as string, refund]));

  const criticalLoadErrors = [courseResult.error].filter(Boolean);

  const showCourses = purchaseKind === "all" || purchaseKind === "course";
  const showWebinars = purchaseKind === "all" || purchaseKind === "webinar" || purchaseKind === "webinar-refunds";
  const showPsychometrics = purchaseKind === "all" || purchaseKind === "psychometric";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Student Purchases</h1>
          <p className="mt-2 text-sm text-slate-600">View your transactions category-wise with refund and access status in one place.</p>
        </div>
        <Link href="/student/dashboard" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
          Back to Dashboard
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {PURCHASE_TABS.map((tab) => {
          const active = purchaseKind === tab.value;
          return (
            <Link
              key={tab.value}
              href={tab.href}
              className={`rounded-full border px-4 py-1.5 font-medium transition ${
                active ? "border-brand-600 bg-brand-50 text-brand-700 shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-brand-300"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {criticalLoadErrors.length > 0 ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          We could not load all purchase records right now. Please refresh or contact support if this persists.
        </div>
      ) : null}

      {showCourses ? (
        <section>
          <h2 className="mt-7 text-base font-semibold">Course Orders</h2>
          <div className="mt-2 space-y-2">
            {courseOrders.length === 0 ? (
              <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No course orders found for this view.</p>
            ) : (
              courseOrders.map((order) => {
                const refund = courseRefundByOrderId.get(order.id);
                const enrollmentStatus = enrollmentStatusByOrderId.get(order.id);
                const eligibility = confirmedCourseOrders.some((confirmed) => confirmed.id === order.id);

                return (
                  <article key={order.id} className="rounded border bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{courseTitles.get(order.course_id) ?? order.course_id}</p>
                      {refund ? <RefundStatusBadge status={refund.refund_status} /> : null}
                    </div>
                    <p className="mt-1 text-slate-700">
                      {formatRupees(order.gross_amount)} · Payment: {toTitleCase(order.payment_status, "Created")}
                      {order.paid_at ? ` · Paid: ${new Date(order.paid_at).toLocaleString()}` : ""}
                    </p>
                    <p className="mt-1 text-slate-700">Enrollment: {enrollmentStatus ? toTitleCase(enrollmentStatus, "Unknown") : eligibility ? "Eligible" : "Pending"}</p>
                    <div className="mt-1 text-xs text-slate-500">Order ID: {order.id}</div>
                    {order.razorpay_payment_id ? <div className="text-xs text-slate-500">Razorpay Payment ID: {order.razorpay_payment_id}</div> : null}
                    <div className="mt-2">{refund ? null : isConfirmedPayment(order.payment_status, order.paid_at) ? <RefundRequestButton orderType="course" orderId={order.id} /> : null}</div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {showWebinars ? (
        <section>
          <h2 className="mt-7 text-base font-semibold">Webinar Orders</h2>
          <div className="mt-2 space-y-2">
            {webinarOrders.length === 0 ? (
              <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No webinar orders found for this view.</p>
            ) : (
              webinarOrders.map((order) => {
                const webinarScopedRegistrations = webinarRegistrationsByWebinarId.get(order.webinar_id) ?? [];
                const directRegistration = webinarRegistrationByOrderId.get(order.id) ?? null;
                const registration = directRegistration ?? pickBestRegistrationForOrder(order.id, webinarScopedRegistrations);
                const webinar = webinarJoin(registration?.webinars);
                const institute = webinarJoin(webinar?.institutes);
                const details = webinarDetails.get(order.webinar_id);
                const startsAt = webinar?.starts_at ?? details?.startsAt ?? null;
                const webinarMode = webinar?.webinar_mode ?? details?.webinarMode ?? null;
                const webinarMeetingUrl = webinar?.meeting_url ?? null;
                const refund = webinarRefundByOrderId.get(order.id);
                if (purchaseKind === "webinar-refunds" && !refund) return null;

                const paymentStatus = registration?.payment_status ?? order.payment_status;
                const registrationStatus = registration?.registration_status ?? "pending";
                const accessStatus = registration?.access_status ?? "pending";
                const canJoin = accessStatus === "granted" && Boolean(webinarMeetingUrl);
                const refundBlockedByExistingState = refund ? ["requested", "processing", "refunded"].includes(refund.refund_status) : false;
                const isRefundBlockedByOrder = !isConfirmedPayment(order.payment_status, order.paid_at) || String(order.order_status ?? "").toLowerCase() !== "confirmed";
                const isRefundBlockedByRegistration = registration ? ["cancelled", "canceled", "revoked"].includes(String(registration.registration_status ?? "").toLowerCase()) : false;
                const canRequestRefund = !refundBlockedByExistingState && !isRefundBlockedByOrder && !isRefundBlockedByRegistration;

                return (
                  <article key={order.id} className="rounded border bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{details?.title ?? order.webinar_id}</p>
                      {refund ? <RefundStatusBadge status={refund.refund_status} /> : null}
                    </div>
                    <p className="mt-1 text-slate-700">
                      {formatRupees(order.amount, order.currency ?? "INR")} · Payment: {toTitleCase(paymentStatus, "Created")} · Registration: {toTitleCase(registrationStatus, "Pending")}
                    </p>
                    <p className="mt-1 text-slate-700">
                      Mode: {toTitleCase(webinarMode, "Not specified")} · Access: {toTitleCase(accessStatus, "Pending")}
                    </p>
                    {registration?.access_start_at ? <p className="mt-1 text-slate-700">Access Starts: {new Date(registration.access_start_at).toLocaleString()}</p> : null}
                    {registration?.access_end_at ? <p className="mt-1 text-slate-700">Access Ends: {new Date(registration.access_end_at).toLocaleString()}</p> : null}
                    {startsAt ? <p className="mt-1 text-slate-700">Webinar Date & Time: {new Date(startsAt).toLocaleString()}</p> : null}
                    {order.order_status ? <p className="mt-1 text-slate-700">Order Status: {toTitleCase(order.order_status, "Created")}</p> : null}
                    {institute?.name ? <p className="mt-1 text-slate-700">Institute: {institute.name}</p> : null}
                    <div className="mt-1 text-xs text-slate-500">Order ID: {order.razorpay_order_id ?? order.id}</div>
                    {order.razorpay_payment_id ? <div className="text-xs text-slate-500">Razorpay Payment ID: {order.razorpay_payment_id}</div> : null}
                    {canJoin ? (
                      <div className="mt-2">
                        <a href={webinarMeetingUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                          Join Webinar
                        </a>
                      </div>
                    ) : null}
                    <div className="mt-2">
                      {canRequestRefund ? (
                        <RefundRequestButton orderType="webinar" orderId={order.id} buttonLabel="Request Webinar Refund" />
                      ) : null}
                    </div>
                    {refund ? (
                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                        Refund Status: {toTitleCase(refund.refund_status, "Requested")} · Amount: {formatRupees(refund.amount, order.currency ?? "INR")} · Requested:{" "}
                        {new Date(refund.requested_at ?? refund.created_at ?? "").toLocaleString()}
                        <div>Payment Reference: {refund.razorpay_payment_id ?? order.razorpay_payment_id ?? "N/A"}</div>
                        <div>Refund ID: {refund.id}</div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {showPsychometrics ? (
        <section>
          <h2 className="mt-7 text-base font-semibold">Psychometric Orders</h2>
          <div className="mt-2 space-y-2">
            {testOrders.length === 0 ? (
              <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No psychometric orders found for this view.</p>
            ) : (
              testOrders.map((order) => {
                const refund = psychometricRefundByOrderId.get(order.id);
                const unlocked = isConfirmedPayment(order.payment_status, order.paid_at) || Boolean(order.razorpay_payment_id);

                return (
                  <article key={order.id} className="rounded border bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{testTitles.get(order.test_id) ?? order.test_id}</p>
                      {refund ? <RefundStatusBadge status={refund.refund_status} /> : null}
                    </div>
                    <p className="mt-1 text-slate-700">
                      {formatRupees(order.final_paid_amount)} · Payment: {toTitleCase(order.payment_status, "Created")}
                      {order.paid_at ? ` · Paid: ${new Date(order.paid_at).toLocaleString()}` : ""}
                    </p>
                    <p className="mt-1 text-slate-700">Access: {unlocked ? "Unlocked" : "Locked / Pending"}</p>
                    <div className="mt-1 text-xs text-slate-500">Order ID: {order.razorpay_order_id ?? order.id}</div>
                    {order.razorpay_payment_id ? <div className="text-xs text-slate-500">Razorpay Payment ID: {order.razorpay_payment_id}</div> : null}
                    <div className="mt-2">{refund ? null : unlocked ? <RefundRequestButton orderType="psychometric" orderId={order.id} /> : null}</div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
