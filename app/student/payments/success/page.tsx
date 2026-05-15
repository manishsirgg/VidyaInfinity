import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;
type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function looksLikeRazorpayOrderId(value: string) {
  return /^order_/i.test(value);
}

export default async function PaymentSuccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { user } = await requireUser("student");
  const orderId = first(params.order_id);
  const razorpayOrderIdParam = first(params.razorpay_order_id);
  const paymentId = first(params.payment_id);
  const razorpayPaymentIdParam = first(params.razorpay_payment_id);
  const kindRaw = first(params.kind).trim().toLowerCase();
  const paymentKindRaw = first(params.paymentKind).trim().toLowerCase();
  const kind = kindRaw === "webinar" || kindRaw === "psychometric" ? kindRaw : "course";
  const paymentKind = paymentKindRaw === "webinar" || paymentKindRaw === "psychometric" ? paymentKindRaw : "course";
  const resolvedKind = kindRaw ? kind : paymentKind;

  let itemTitle: string | null = null;
  let amount: number | null = null;
  let webinarMeetingUrl: string | null = null;
  let webinarAccessGranted = false;
  let coursePaymentStatus: string | null = null;
  let resolvedOrderId = orderId || null;
  let resolvedPaymentId = paymentId || null;
  const kindTitle = resolvedKind === "webinar" ? "webinar" : resolvedKind === "psychometric" ? "psychometric test" : "course";

  if (orderId || razorpayOrderIdParam || paymentId || razorpayPaymentIdParam) {
    const supabase = await createClient();
    console.info("[student/payments/success] received params", {
      order_id: orderId || null,
      razorpay_order_id: razorpayOrderIdParam || null,
      payment_id: paymentId || null,
      razorpay_payment_id: razorpayPaymentIdParam || null,
      kindRaw: kindRaw || null,
      paymentKindRaw: paymentKindRaw || null,
      detectedKind: resolvedKind,
    });
    if (resolvedKind === "webinar") {
      const { data } = await supabase
        .from("webinar_orders")
        .select("webinar_id,amount,webinars(title,meeting_url)")
        .eq("student_id", user.id)
        .eq("razorpay_order_id", orderId || razorpayOrderIdParam)
        .maybeSingle<{
          webinar_id: string;
          amount: number;
          webinars: { title: string | null; meeting_url: string | null } | { title: string | null; meeting_url: string | null }[] | null;
        }>();
      amount = data?.amount ?? null;
      if (data?.webinars) {
        const webinar = Array.isArray(data.webinars) ? data.webinars[0] : data.webinars;
        itemTitle = webinar?.title ?? null;
        webinarMeetingUrl = webinar?.meeting_url ?? null;
      }
      if (data?.webinar_id) {
        const { data: registration } = await supabase
          .from("webinar_registrations")
          .select("access_status")
          .eq("student_id", user.id)
          .eq("webinar_id", data.webinar_id)
          .maybeSingle<{ access_status: string | null }>();
        webinarAccessGranted = registration?.access_status === "granted";
      }
    } else if (resolvedKind === "psychometric") {
      const { data } = await supabase
        .from("psychometric_orders")
        .select("final_paid_amount,psychometric_tests(title)")
        .eq("user_id", user.id)
        .eq("razorpay_order_id", orderId || razorpayOrderIdParam)
        .maybeSingle<{ final_paid_amount: number; psychometric_tests: { title: string | null } | { title: string | null }[] | null }>();
      amount = data?.final_paid_amount ?? null;
      if (data?.psychometric_tests) {
        itemTitle = Array.isArray(data.psychometric_tests)
          ? (data.psychometric_tests[0]?.title ?? null)
          : (data.psychometric_tests.title ?? null);
      }
    } else {
      type CourseOrderWithRelation = {
        gross_amount: number;
        payment_status: string | null;
        razorpay_order_id: string | null;
        razorpay_payment_id: string | null;
        course_id: string | null;
        id: string;
        paid_at: string | null;
        courses: { title: string | null } | { title: string | null }[] | null;
      };

      const attempts: Array<{ label: string; column: "razorpay_order_id" | "razorpay_payment_id" | "id"; value: string }> = [];
      if (razorpayOrderIdParam) attempts.push({ label: "a. razorpay_order_id = razorpay_order_id", column: "razorpay_order_id", value: razorpayOrderIdParam });
      if (orderId && looksLikeRazorpayOrderId(orderId)) {
        attempts.push({ label: "b. razorpay_order_id = order_id (order_ only)", column: "razorpay_order_id", value: orderId });
      }
      if (paymentId) attempts.push({ label: "c. razorpay_payment_id = payment_id", column: "razorpay_payment_id", value: paymentId });
      if (razorpayPaymentIdParam) attempts.push({ label: "d. razorpay_payment_id = razorpay_payment_id", column: "razorpay_payment_id", value: razorpayPaymentIdParam });
      if (orderId && looksLikeUuid(orderId)) attempts.push({ label: "e. course_orders.id = order_id (uuid only)", column: "id", value: orderId });

      const seen = new Set<string>();
      const dedupedAttempts = attempts.filter((attempt) => {
        const key = `${attempt.column}:${attempt.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      let data: CourseOrderWithRelation | null = null;
      let matchedStrategy: string | null = null;
      let relationLookupError = false;
      let lookupClient: "session" | "admin" | null = null;
      const attemptLookup = async (client: ServerSupabaseClient) => {
        for (const attempt of dedupedAttempts) {
          const { data: found, error } = await client
            .from("course_orders")
            .select("id,gross_amount,currency,payment_status,razorpay_order_id,razorpay_payment_id,paid_at,course_id,courses(title)")
            .eq("student_id", user.id)
            .eq(attempt.column, attempt.value)
            .limit(1)
            .maybeSingle();
          if (error) relationLookupError = true;
          if (found) {
            return { found: found as CourseOrderWithRelation, strategy: attempt.label };
          }
        }
        return { found: null, strategy: null };
      };

      const sessionLookup = await attemptLookup(supabase);
      data = sessionLookup.found;
      matchedStrategy = sessionLookup.strategy;
      if (data) lookupClient = "session";

      if (!data) {
        const admin = getSupabaseAdmin();
        if (admin.ok) {
          const adminLookup = await attemptLookup(admin.data as ServerSupabaseClient);
          data = adminLookup.found;
          matchedStrategy = adminLookup.strategy;
          if (data) lookupClient = "admin";
        }
      }

      let relationTitleFound = false;
      let fallbackCourseTitleFound = false;
      const relatedCourseTitle = data?.courses
        ? (Array.isArray(data.courses) ? (data.courses[0]?.title ?? null) : (data.courses.title ?? null))
        : null;
      if (relatedCourseTitle) relationTitleFound = true;

      if (data && (!data.courses || !relatedCourseTitle) && data.course_id) {
        const { data: courseRow } = await supabase
          .from("courses")
          .select("title")
          .eq("id", data.course_id)
          .maybeSingle<{ title: string | null }>();
        if (courseRow) {
          fallbackCourseTitleFound = Boolean(courseRow.title);
          data = {
            ...data,
            courses: { title: courseRow.title },
          };
        }
      }

      if (!data) {
        console.info("[student/payments/success] Course order lookup failed", {
          order_id: orderId || null,
          razorpay_order_id: razorpayOrderIdParam || null,
          payment_id: paymentId || null,
          razorpay_payment_id: razorpayPaymentIdParam || null,
          detectedKind: resolvedKind,
          lookupStrategies: dedupedAttempts.map((attempt) => attempt.label),
          lookupClientTried: ["session", "admin"],
          found: false,
          relationLookupError,
        });
      } else {
        console.info("[student/payments/success] Course order lookup success", {
          strategy: matchedStrategy,
          lookupClient,
          order_id: orderId || null,
          razorpay_order_id: razorpayOrderIdParam || null,
          payment_id: paymentId || null,
          relationTitleFound,
          fallbackCourseTitleFound,
          found: true,
        });
      }

      amount = data?.gross_amount ?? null;
      coursePaymentStatus = data?.payment_status ?? null;
      resolvedOrderId = data?.razorpay_order_id ?? resolvedOrderId;
      resolvedPaymentId = data?.razorpay_payment_id ?? resolvedPaymentId;
      if (data?.courses) {
        itemTitle = Array.isArray(data.courses) ? (data.courses[0]?.title ?? null) : (data.courses.title ?? null);
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-emerald-700">
          {resolvedKind === "webinar" ? "Webinar payment successful" : "Payment successful"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {resolvedKind === "webinar"
            ? "Your webinar registration is confirmed and your access has been activated."
            : `Your ${kindTitle} purchase is confirmed and access is being activated.`}
        </p>

        <div className="mt-4 space-y-2 rounded bg-slate-50 p-4 text-sm text-slate-700">
          <p>{resolvedKind === "webinar" ? "Webinar" : "Item"}: {itemTitle ?? `Your selected ${kindTitle}`}</p>
          <p>Amount: {amount !== null ? `₹${amount}` : "-"}</p>
          <p>{resolvedKind === "webinar" ? "Webinar Order ID" : "Order ID"}: {(resolvedKind === "course" ? resolvedOrderId : orderId || razorpayOrderIdParam) || "-"}</p>
          <p>{resolvedKind === "webinar" ? "Webinar Payment ID" : "Payment ID"}: {(resolvedKind === "course" ? resolvedPaymentId : paymentId || razorpayPaymentIdParam) || "-"}</p>
          {resolvedKind === "course" ? <p>Payment Status: {coursePaymentStatus ?? "-"}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/student/dashboard" className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white">Student dashboard</Link>
          {resolvedKind === "webinar" ? (
            <>
              <Link href="/student/dashboard" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">My Webinar Registrations</Link>
              <Link href="/student/purchases?kind=webinar" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Webinar Purchases</Link>
              <Link href="/webinars" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Browse Webinars</Link>
              {webinarAccessGranted && webinarMeetingUrl ? (
                <a href={webinarMeetingUrl} target="_blank" rel="noreferrer" className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
                  Join Webinar
                </a>
              ) : null}
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
