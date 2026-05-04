import Link from "next/link";

import { RefundRequestButton } from "@/components/student/refund-request-button";
import { requireUser } from "@/lib/auth/get-session";
import type { CanonicalOrderKind } from "@/lib/payments/order-kinds";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid, reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveWebinarAccessState } from "@/lib/webinars/access-state";

type CoursePurchase = {
  id: string;
  student_id: string;
  gross_amount: number | null;
  institute_receivable_amount: number | null;
  institute_id: string;
  currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  course_id: string;
  created_at: string | null;
  razorpay_order_id: string | null;
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
  student_id: string;
  institute_id: string;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  order_status: string | null;
  access_status: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  created_at?: string | null;
  webinar_registrations:
    | {
        id: string;
        webinar_order_id: string | null;
        webinar_id: string;
        created_at?: string | null;
        registered_at?: string | null;
        registration_status: string | null;
        payment_status: string | null;
        access_status: string | null;
        access_delivery_status?: string | null;
        access_start_at: string | null;
        access_end_at: string | null;
        access_granted_at: string | null;
        reveal_started_at: string | null;
        email_sent_at: string | null;
        whatsapp_sent_at: string | null;
      }
    | {
        id: string;
        webinar_order_id: string | null;
        webinar_id: string;
        created_at?: string | null;
        registered_at?: string | null;
        registration_status: string | null;
        payment_status: string | null;
        access_status: string | null;
        access_delivery_status?: string | null;
        access_start_at: string | null;
        access_end_at: string | null;
        access_granted_at: string | null;
        reveal_started_at: string | null;
        email_sent_at: string | null;
        whatsapp_sent_at: string | null;
      }[]
    | null;
  webinars:
    | {
        title: string | null;
        starts_at: string | null;
        webinar_mode: string | null;
        meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        title: string | null;
        starts_at: string | null;
        webinar_mode: string | null;
        meeting_provider: string | null;
        institutes: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

type RefundRecord = {
  id: string;
  refund_status: "requested" | "processing" | "refunded" | "failed" | "cancelled";
  order_kind: CanonicalOrderKind;
  reason: string | null;
  amount: number | null;
  requested_at: string | null;
  processed_at?: string | null;
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

type SectionErrors = {
  courses: string | null;
  psychometric: string | null;
  webinarOrders: string | null;
  webinarRefunds: string | null;
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
      {status === "requested" ? "Refund Requested" : status === "refunded" ? "Refund Processed" : status === "failed" ? "Refund Failed" : `Refund ${toTitleCase(status, "Requested")}`}
    </span>
  );
}

function webinarJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function deriveCapturedPaymentIdForOrder(razorpayOrderId: string) {
  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return null;

  try {
    const paymentList = (await razorpay.data.orders.fetchPayments(razorpayOrderId)) as {
      items?: Array<{ id?: string; status?: string }>;
    };
    const capturedPayment = (paymentList.items ?? []).find((item) => item.id && String(item.status ?? "").toLowerCase() === "captured");
    return capturedPayment?.id ?? null;
  } catch (error) {
    console.warn("[student/purchases] pending_order_capture_probe_failed", {
      event: "pending_order_capture_probe_failed",
      razorpay_order_id: razorpayOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ kind?: string | string[] }>;
}) {
  const { user, profile } = await requireUser("student");
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const resolvedParams = searchParams ? await searchParams : undefined;
  const purchaseKind = getPurchaseKindFilter(resolvedParams?.kind);

  console.info("[student/purchases] purchases_page_load_started", {
    event: "purchases_page_load_started",
    user_id: profile.id,
    purchase_kind: purchaseKind,
  });

  const sectionErrors: SectionErrors = {
    courses: null,
    psychometric: null,
    webinarOrders: null,
    webinarRefunds: null,
  };

  const [courseResult, testResult, webinarResult] = await Promise.all([
    dataClient
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,paid_at,created_at,razorpay_order_id,razorpay_payment_id")
      .eq("student_id", profile.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("psychometric_orders")
      .select("id,final_paid_amount,payment_status,paid_at,test_id,razorpay_order_id,razorpay_payment_id,created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("webinar_orders")
      .select(
        "id,webinar_id,student_id,institute_id,amount,currency,payment_status,paid_at,order_status,access_status,razorpay_order_id,razorpay_payment_id,created_at,webinar_registrations(id,webinar_order_id,webinar_id,created_at,registered_at,registration_status,payment_status,access_status,access_delivery_status,access_start_at,access_end_at,access_granted_at,reveal_started_at,email_sent_at,whatsapp_sent_at),webinars(title,starts_at,webinar_mode,meeting_provider,institutes(name))",
      )
      .eq("student_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  if (courseResult.error) sectionErrors.courses = courseResult.error.message;
  if (testResult.error) sectionErrors.psychometric = testResult.error.message;
  if (webinarResult.error) {
    sectionErrors.webinarOrders = webinarResult.error.message;
    console.error("[student/purchases] purchases_page_webinar_orders_failed", {
      event: "purchases_page_webinar_orders_failed",
      user_id: profile.id,
      error: webinarResult.error.message,
    });
  } else {
    console.info("[student/purchases] purchases_page_webinar_orders_loaded", {
      event: "purchases_page_webinar_orders_loaded",
      user_id: profile.id,
      count: webinarResult.data?.length ?? 0,
    });
  }

  let courseOrders = (courseResult.data ?? []) as CoursePurchase[];
  const testOrders = (testResult.data ?? []) as PsychometricPurchase[];
  let webinarOrders = (webinarResult.data ?? []) as WebinarPurchase[];

  if (admin.ok) {
    const pendingCourseOrders = courseOrders
      .filter((order) => !isConfirmedPayment(order.payment_status, order.paid_at) && Boolean(order.razorpay_order_id))
      .slice(0, 5);
    const pendingWebinarOrders = webinarOrders
      .filter((order) => !isConfirmedPayment(order.payment_status, order.paid_at) && Boolean(order.razorpay_order_id))
      .slice(0, 5);

    let syncMutated = false;

    for (const order of pendingCourseOrders) {
      const razorpayOrderId = order.razorpay_order_id;
      if (!razorpayOrderId) continue;
      const capturedPaymentId = await deriveCapturedPaymentIdForOrder(razorpayOrderId);
      if (!capturedPaymentId) continue;

      const reconciled = await reconcileCourseOrderPaid({
        supabase: admin.data,
        order: {
          id: order.id,
          student_id: order.student_id,
          course_id: order.course_id,
          institute_id: order.institute_id,
          gross_amount: Number(order.gross_amount ?? 0),
          institute_receivable_amount: Number(order.institute_receivable_amount ?? 0),
          currency: order.currency ?? "INR",
          payment_status: order.payment_status ?? "created",
        },
        razorpayOrderId,
        razorpayPaymentId: capturedPaymentId,
        source: "verify_api",
        gatewayResponse: { source: "student_purchases_page_probe" },
      });

      if (!reconciled.error) syncMutated = true;
    }

    for (const order of pendingWebinarOrders) {
      const razorpayOrderId = order.razorpay_order_id;
      if (!razorpayOrderId) continue;
      const capturedPaymentId = await deriveCapturedPaymentIdForOrder(razorpayOrderId);
      if (!capturedPaymentId) continue;

      const reconciled = await reconcileWebinarOrderPaid({
        supabase: admin.data,
        order: {
          id: order.id,
          webinar_id: order.webinar_id,
          student_id: order.student_id,
          institute_id: order.institute_id,
          amount: Number(order.amount ?? 0),
          currency: order.currency ?? "INR",
          payment_status: order.payment_status ?? "pending",
          order_status: order.order_status ?? "pending",
          access_status: order.access_status ?? "locked",
        },
        razorpayOrderId,
        razorpayPaymentId: capturedPaymentId,
        source: "verify_api",
        paymentEventType: "payment.status",
      });

      if (!reconciled.error) syncMutated = true;
    }

    if (syncMutated) {
      const [refreshedCourses, refreshedWebinars] = await Promise.all([
        dataClient
          .from("course_orders")
          .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,paid_at,created_at,razorpay_order_id,razorpay_payment_id")
          .eq("student_id", profile.id)
          .order("created_at", { ascending: false }),
        dataClient
          .from("webinar_orders")
          .select(
            "id,webinar_id,student_id,institute_id,amount,currency,payment_status,paid_at,order_status,access_status,razorpay_order_id,razorpay_payment_id,created_at,webinar_registrations(id,webinar_order_id,webinar_id,created_at,registered_at,registration_status,payment_status,access_status,access_delivery_status,access_start_at,access_end_at,access_granted_at,reveal_started_at,email_sent_at,whatsapp_sent_at),webinars(title,starts_at,webinar_mode,meeting_provider,institutes(name))",
          )
          .eq("student_id", profile.id)
          .order("created_at", { ascending: false }),
      ]);

      if (!refreshedCourses.error) courseOrders = (refreshedCourses.data ?? []) as CoursePurchase[];
      if (!refreshedWebinars.error) webinarOrders = (refreshedWebinars.data ?? []) as WebinarPurchase[];
    }
  }

  const { data: refundsData, error: refundsError } = await dataClient
    .from("refunds")
    .select("id,refund_status,order_kind,reason,amount,requested_at,processed_at,created_at,razorpay_payment_id,course_order_id,psychometric_order_id,webinar_order_id")
    .eq("user_id", profile.id)
    .returns<RefundRecord[]>();

  if (refundsError) {
    sectionErrors.webinarRefunds = refundsError.message;
    console.error("[student/purchases] purchases_page_webinar_refunds_failed", {
      event: "purchases_page_webinar_refunds_failed",
      user_id: profile.id,
      error: refundsError.message,
    });
  } else {
    console.info("[student/purchases] purchases_page_webinar_refunds_loaded", {
      event: "purchases_page_webinar_refunds_loaded",
      user_id: profile.id,
      count: refundsData?.filter((item) => item.order_kind === "webinar_registration").length ?? 0,
    });
  }

  const enrollmentWithStatus = await dataClient
    .from("course_enrollments")
    .select("course_id,course_order_id,enrollment_status")
    .eq("student_id", profile.id)
    .in("enrollment_status", [...ENROLLMENT_STATUSES_VISIBLE]);

  const enrollmentResult =
    enrollmentWithStatus.error && enrollmentWithStatus.error.message.toLowerCase().includes("enrollment_status")
      ? await dataClient.from("course_enrollments").select("course_id,course_order_id").eq("student_id", profile.id)
      : enrollmentWithStatus;

  if (enrollmentResult.error) {
    console.error("[student/purchases] enrollment fetch failed", { user_id: profile.id, error: enrollmentResult.error.message });
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
    const { data: courses } = await dataClient.from("courses").select("id,title").in("id", courseIds);
    for (const course of courses ?? []) {
      courseTitles.set(course.id, course.title ?? course.id);
    }
  }

  const webinarIds = Array.from(new Set(webinarOrders.map((order) => order.webinar_id).filter(Boolean)));
  const webinarDetails = new Map<string, { title: string; startsAt: string | null; webinarMode: string | null }>();
  const testIds = Array.from(new Set(testOrders.map((order) => order.test_id).filter(Boolean)));
  const testTitles = new Map<string, string>();

  if (webinarIds.length > 0) {
    const { data: webinars } = await dataClient.from("webinars").select("id,title,starts_at,webinar_mode").in("id", webinarIds);
    for (const webinar of webinars ?? []) {
      webinarDetails.set(webinar.id, {
        title: webinar.title ?? webinar.id,
        startsAt: webinar.starts_at ?? null,
        webinarMode: webinar.webinar_mode ?? null,
      });
    }
  }

  if (testIds.length > 0) {
    const { data: tests } = await dataClient.from("psychometric_tests").select("id,title").in("id", testIds);
    for (const test of tests ?? []) {
      testTitles.set(test.id, test.title ?? test.id);
    }
  }

  const refunds = refundsData ?? [];
  const courseRefundByOrderId = new Map(refunds.filter((refund) => refund.course_order_id).map((refund) => [refund.course_order_id as string, refund]));
  const psychometricRefundByOrderId = new Map(
    refunds.filter((refund) => refund.psychometric_order_id).map((refund) => [refund.psychometric_order_id as string, refund]),
  );
  const webinarRefundByOrderId = new Map(
    refunds.filter((refund) => refund.webinar_order_id && refund.order_kind === "webinar_registration").map((refund) => [refund.webinar_order_id as string, refund]),
  );

  const showCourses = purchaseKind === "all" || purchaseKind === "course";
  const showWebinars = purchaseKind === "all" || purchaseKind === "webinar" || purchaseKind === "webinar-refunds";
  const showPsychometrics = purchaseKind === "all" || purchaseKind === "psychometric";

  const webinarAccessResolutionByOrderId = new Map(
    await Promise.all(
      webinarOrders.map(async (order) => {
        if (!order.webinar_id) {
          return [order.id, null] as const;
        }

        try {
          const resolvedAccess = await resolveWebinarAccessState(dataClient, order.webinar_id, user.id);
          return [order.id, resolvedAccess] as const;
        } catch (error) {
          console.error("[student/purchases] webinar access resolution failed", {
            user_id: profile.id,
            webinar_order_id: order.id,
            webinar_id: order.webinar_id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [order.id, null] as const;
        }
      }),
    ),
  );

  const webinarOrdersForRender = purchaseKind === "webinar-refunds" ? webinarOrders.filter((order) => webinarRefundByOrderId.has(order.id)) : webinarOrders;

  console.info("[student/purchases] purchases_page_render_completed", {
    event: "purchases_page_render_completed",
    user_id: profile.id,
    purchase_kind: purchaseKind,
    counts: {
      courses: courseOrders.length,
      webinars: webinarOrdersForRender.length,
      psychometric: testOrders.length,
    },
  });

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

      {showCourses ? (
        <section>
          <h2 className="mt-7 text-base font-semibold">Course Orders</h2>
          {sectionErrors.courses ? <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Unable to load course orders right now.</p> : null}
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
          {sectionErrors.webinarOrders ? (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Unable to load webinar orders right now. Other purchase sections are still available.</p>
          ) : null}
          {sectionErrors.webinarRefunds ? (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Unable to load webinar refunds right now. Webinar orders are still shown.</p>
          ) : null}

          <div className="mt-2 space-y-2">
            {webinarOrdersForRender.length === 0 ? (
              <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">
                {purchaseKind === "webinar-refunds" ? "No webinar refunds found." : "No webinar orders found for this view."}
              </p>
            ) : (
              webinarOrdersForRender.map((order) => {
                const registration = webinarJoin(order.webinar_registrations);
                const webinar = webinarJoin(order.webinars);
                const institute = webinarJoin(webinar?.institutes);
                const startsAt = webinar?.starts_at ?? webinarDetails.get(order.webinar_id)?.startsAt ?? null;
                const webinarMode = webinar?.webinar_mode ?? webinarDetails.get(order.webinar_id)?.webinarMode ?? null;
                const refund = webinarRefundByOrderId.get(order.id);
                const resolvedAccess = webinarAccessResolutionByOrderId.get(order.id);

                const hasPaidOrder = isConfirmedPayment(order.payment_status, order.paid_at);
                const registrationStatus = registration?.registration_status ?? (hasPaidOrder ? "registered" : "not_registered");
                const accessStatus = registration?.access_status ?? order.access_status ?? "no_access";
                const deliveryStatus = registration?.access_delivery_status ?? null;

                console.info("[student/purchases] webinar_purchase_state_resolved", {
                  event: "webinar_purchase_state_resolved",
                  user_id: profile.id,
                  webinar_order_id: order.id,
                  webinar_id: order.webinar_id,
                  registration_status: registrationStatus,
                  access_status: accessStatus,
                  delivery_status: deliveryStatus,
                });

                if (deliveryStatus === "pending" && String(accessStatus).toLowerCase() === "granted") {
                  console.info("[student/purchases] webinar_delivery_status_ignored_for_access_truth", {
                    event: "webinar_delivery_status_ignored_for_access_truth",
                    user_id: profile.id,
                    webinar_order_id: order.id,
                    webinar_id: order.webinar_id,
                    access_status: accessStatus,
                    delivery_status: deliveryStatus,
                  });
                }

                const canJoin = ["granted", "revealed"].includes(resolvedAccess?.state ?? "");
                const refundBlockedByExistingState = refund ? ["requested", "processing", "refunded"].includes(refund.refund_status) : false;
                const isRefundBlockedByOrder = !isConfirmedPayment(order.payment_status, order.paid_at) || String(order.order_status ?? "").toLowerCase() !== "confirmed";
                const isRefundBlockedByRegistration = registration
                  ? ["cancelled", "canceled", "revoked"].includes(String(registration.registration_status ?? "").toLowerCase()) ||
                    String(registration.access_status ?? "").toLowerCase() === "revoked"
                  : false;
                const webinarStartsAtMs = startsAt ? new Date(startsAt).getTime() : Number.NaN;
                const isStarted = Number.isFinite(webinarStartsAtMs) ? Date.now() >= webinarStartsAtMs : false;
                const isInsideRefundWindow = Number.isFinite(webinarStartsAtMs) ? Date.now() < webinarStartsAtMs - 30 * 60 * 1000 : true;
                const hasDeliveryEvidence = Boolean(registration?.access_granted_at || registration?.reveal_started_at || registration?.email_sent_at || registration?.whatsapp_sent_at);
                const canRequestRefund = !refundBlockedByExistingState && !isRefundBlockedByOrder && !isRefundBlockedByRegistration;
                const refundAllowedForWebinar = canRequestRefund && isInsideRefundWindow && !hasDeliveryEvidence && !isStarted;
                const accessRevoked = ["revoked", "refunded"].includes(String(accessStatus).toLowerCase());

                return (
                  <article key={order.id} className="rounded border bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{webinarDetails.get(order.webinar_id)?.title ?? webinar?.title ?? order.webinar_id}</p>
                      {refund ? <RefundStatusBadge status={refund.refund_status} /> : null}
                    </div>
                    <p className="mt-1 text-slate-700">
                      {formatRupees(order.amount, order.currency ?? "INR")} · Payment: {toTitleCase(order.payment_status, "Created")} · Registration: {toTitleCase(registrationStatus, "Pending")}
                    </p>
                    <p className="mt-1 text-slate-700">Mode: {toTitleCase(webinarMode, "Not specified")} · Access: {toTitleCase(accessStatus, "No Access")}</p>
                    {deliveryStatus === "pending" ? <p className="mt-1 text-xs text-amber-700">Delivery update pending. Your access status remains {toTitleCase(accessStatus, "No Access")}.</p> : null}
                    {registration?.access_start_at ? <p className="mt-1 text-slate-700">Access Starts: {new Date(registration.access_start_at).toLocaleString()}</p> : null}
                    {registration?.access_end_at ? <p className="mt-1 text-slate-700">Access Ends: {new Date(registration.access_end_at).toLocaleString()}</p> : null}
                    {startsAt ? <p className="mt-1 text-slate-700">Webinar Date & Time: {new Date(startsAt).toLocaleString()}</p> : null}
                    {order.order_status ? <p className="mt-1 text-slate-700">Order Status: {toTitleCase(order.order_status, "Created")}</p> : null}
                    {institute?.name ? <p className="mt-1 text-slate-700">Institute: {institute.name}</p> : null}
                    <div className="mt-1 text-xs text-slate-500">Order ID: {order.razorpay_order_id ?? order.id}</div>
                    {order.razorpay_payment_id ? <div className="text-xs text-slate-500">Razorpay Payment ID: {order.razorpay_payment_id}</div> : null}
                    {accessRevoked ? <p className="mt-2 text-xs text-rose-700">Access Revoked</p> : null}
                    {canJoin ? (
                      <div className="mt-2">
                        <a href={`/student/webinars/${order.webinar_id}/join`} className="inline-flex rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                          Join Webinar
                        </a>
                      </div>
                    ) : null}
                    {["registered_confirmed", "locked_until_window"].includes(resolvedAccess?.state ?? "") ? (
                      <p className="mt-2 text-xs text-slate-600">Registration Confirmed. Access unlocks 15 minutes before webinar starts{resolvedAccess?.revealAt ? ` (${new Date(resolvedAccess.revealAt).toLocaleString()})` : ""}.</p>
                    ) : null}
                    <div className="mt-2">
                      {refundAllowedForWebinar ? (
                        <RefundRequestButton
                          orderType="webinar"
                          orderId={order.id}
                          buttonLabel="Request Webinar Refund"
                          disabled={Boolean(refund)}
                        />
                      ) : null}
                    </div>
                    {!refund && !refundAllowedForWebinar && order.payment_status === "paid" ? (
                      <p className="mt-2 text-xs text-amber-700">{resolvedAccess?.refundBlockedReason ?? "Refund eligibility window has closed."}</p>
                    ) : null}
                    {refund ? (
                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                        Refund Status: {toTitleCase(refund.refund_status, "Requested")} · Amount: {formatRupees(refund.amount, order.currency ?? "INR")} · Requested:{" "}
                        {new Date(refund.requested_at ?? refund.created_at ?? "").toLocaleString()}
                        <div>Payment Reference: {refund.razorpay_payment_id ?? order.razorpay_payment_id ?? "N/A"}</div>
                        <div>Refund ID: {refund.id}</div>
                        {refund.processed_at ? <div>Processed At: {new Date(refund.processed_at).toLocaleString()}</div> : null}
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
          {sectionErrors.psychometric ? <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Unable to load psychometric orders right now.</p> : null}
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
