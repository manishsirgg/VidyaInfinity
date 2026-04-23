import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { REFUND_ORDER_TYPE_TO_CANONICAL_KIND } from "@/lib/payments/order-kinds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type IdentityDocument = {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

type InquiryItem = {
  id: string;
  created_at: string;
  course_id: string | null;
  message: string | null;
};

type EnrollmentItem = {
  id: string;
  course_id: string;
  enrollment_status: string;
  created_at: string;
  access_end_at?: string | null;
};

type CourseOrderItem = {
  id: string;
  course_id: string | null;
  payment_status: string | null;
  paid_at: string | null;
  created_at: string | null;
};

type TestAttemptItem = {
  id: string;
  test_id: string;
  status: string;
  score: number | null;
  created_at: string;
};

type WebinarRegistrationItem = {
  id: string;
  webinar_id: string;
  created_at: string;
  payment_status: string;
  access_status: string;
  registration_status: string;
  webinars:
    | { title: string; starts_at: string; ends_at: string | null; status: string; webinar_mode: string; meeting_provider: string | null; meeting_url: string | null; institutes: { name: string | null } | { name: string | null }[] | null }
    | { title: string; starts_at: string; ends_at: string | null; status: string; webinar_mode: string; meeting_provider: string | null; meeting_url: string | null; institutes: { name: string | null } | { name: string | null }[] | null }[]
    | null;
};

type WebinarOrderItem = {
  id: string;
  webinar_id: string;
  payment_status: string | null;
  amount: number | null;
  paid_at: string | null;
  created_at: string;
  webinars:
    | { title: string | null; starts_at: string | null; ends_at: string | null; webinar_mode: string | null; status: string | null; meeting_provider: string | null; meeting_url: string | null; institutes: { name: string | null } | { name: string | null }[] | null }
    | { title: string | null; starts_at: string | null; ends_at: string | null; webinar_mode: string | null; status: string | null; meeting_provider: string | null; meeting_url: string | null; institutes: { name: string | null } | { name: string | null }[] | null }[]
    | null;
};

type RefundItem = {
  id: string;
  order_kind: string | null;
  reason: string | null;
  refund_status: string;
  amount: number | null;
  requested_at: string | null;
  processed_at: string | null;
  created_at: string;
};

const COURSE_ENROLLMENT_ACTIVE_STATUSES = ["enrolled", "pending", "active", "suspended", "completed"] as const;
const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);
const REFUND_OPEN_STATUSES = ["requested", "processing"] as const;

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toTitleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusTone(status: string) {
  if (status === "approved") return "text-emerald-700";
  if (status === "rejected") return "text-rose-700";
  return "text-amber-700";
}

function webinarInfo(
  webinar: WebinarRegistrationItem["webinars"],
): { title: string; starts_at: string; ends_at: string | null; status: string; webinar_mode: string; meeting_provider: string | null; meeting_url: string | null; institutes: { name: string | null } | { name: string | null }[] | null } | null {
  if (!webinar) return null;
  if (Array.isArray(webinar)) return webinar[0] ?? null;
  return webinar;
}

function extractInstituteName(institutes: { name: string | null } | { name: string | null }[] | null | undefined) {
  if (!institutes) return null;
  if (Array.isArray(institutes)) return institutes[0]?.name ?? null;
  return institutes.name ?? null;
}

function isConfirmedPayment(status: string | null | undefined, paidAt?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (SUCCESS_PAYMENT_STATUSES.has(normalized)) return true;
  return Boolean(paidAt);
}

export default async function StudentDashboardPage() {
  const { user, profile } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const [
    { data: courseOrderRows },
    { count: paidPsychometricOrders },
    { data: activeEnrollmentRows, count: activeEnrollmentCount },
    { count: inquiryCount },
    { count: unreadNotificationCount },
    { data: latestIdentityDocument },
    { data: recentNotifications },
    { data: recentInquiries },
    { data: recentEnrollments },
    { data: recentTestAttempts },
    { data: webinarMetricRows },
    { count: webinarRefundRequestsCount },
    { data: recentWebinarRegistrations },
    { data: recentWebinarTransactions },
    { count: openRefundRequestsCount },
    { data: recentRefundRequests },
  ] = await Promise.all([
    dataClient.from("course_orders").select("id,course_id,payment_status,paid_at,created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
    supabase.from("psychometric_orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("payment_status", "paid"),
    dataClient
      .from("course_enrollments")
      .select("id,course_id,enrollment_status,created_at,access_end_at", { count: "exact" })
      .eq("student_id", user.id)
      .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES]),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("email", profile.email),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    supabase
      .from("user_documents")
      .select("id,document_type,status,rejection_reason,created_at")
      .eq("user_id", user.id)
      .eq("document_category", "identity")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<IdentityDocument>(),
    supabase
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<NotificationItem[]>(),
    supabase
      .from("leads")
      .select("id,created_at,course_id,message")
      .eq("email", profile.email)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<InquiryItem[]>(),
    dataClient
      .from("course_enrollments")
      .select("id,course_id,enrollment_status,created_at,access_end_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<EnrollmentItem[]>(),
    supabase
      .from("test_attempts")
      .select("id,test_id,status,score,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<TestAttemptItem[]>(),
    dataClient
      .from("webinar_registrations")
      .select("id,registration_status,payment_status,access_status,webinar_id,webinars(starts_at,webinar_mode)")
      .eq("student_id", user.id)
      .returns<
        {
          id: string;
          registration_status: string;
          payment_status: string;
          access_status: string | null;
          webinar_id: string;
          webinars: { starts_at: string | null; webinar_mode: string | null } | { starts_at: string | null; webinar_mode: string | null }[] | null;
        }[]
      >(),
    dataClient
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("order_kind", [REFUND_ORDER_TYPE_TO_CANONICAL_KIND.webinar]),
    dataClient
      .from("webinar_registrations")
      .select("id,webinar_id,created_at,payment_status,access_status,registration_status,webinars(title,starts_at,ends_at,status,webinar_mode,meeting_provider,meeting_url,institutes(name))")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<WebinarRegistrationItem[]>(),
    dataClient
      .from("webinar_orders")
      .select("id,webinar_id,payment_status,amount,paid_at,created_at,webinars(title,starts_at,ends_at,webinar_mode,status,meeting_provider,meeting_url,institutes(name))")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<WebinarOrderItem[]>(),
    dataClient.from("refunds").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("refund_status", [...REFUND_OPEN_STATUSES]),
    dataClient
      .from("refunds")
      .select("id,order_kind,reason,refund_status,amount,requested_at,processed_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<RefundItem[]>(),
  ]);

  const allCourseOrders = (courseOrderRows ?? []) as CourseOrderItem[];
  const enrollmentRows = ((activeEnrollmentRows ?? []) as EnrollmentItem[]).filter(Boolean);
  const confirmedCourseOrders = allCourseOrders.filter((order) => isConfirmedPayment(order.payment_status, order.paid_at));
  const paidCourseOrders = confirmedCourseOrders.length;
  const courseIds = Array.from(new Set(allCourseOrders.map((item) => item.course_id).filter((value): value is string => Boolean(value))));
  const { data: courseRows } =
    courseIds.length > 0 ? await supabase.from("courses").select("id,title").in("id", courseIds) : { data: [] as { id: string; title: string | null }[] };
  const courseTitleMap = new Map((courseRows ?? []).map((item) => [item.id, item.title ?? item.id]));
  const recentCourseTransactions = allCourseOrders.slice(0, 3);
  const enrollmentCourseIds = new Set(enrollmentRows.map((row) => row.course_id).filter(Boolean));
  const fallbackRecentEnrollments: EnrollmentItem[] = confirmedCourseOrders
    .filter((order) => order.course_id && !enrollmentCourseIds.has(order.course_id))
    .slice(0, 3)
    .map((order) => ({
      id: `order-${order.id}`,
      course_id: order.course_id as string,
      enrollment_status: "enrolled",
      created_at: order.paid_at ?? order.created_at ?? new Date().toISOString(),
      access_end_at: null,
    }));
  const mergedRecentEnrollments = [...((recentEnrollments ?? []) as EnrollmentItem[]), ...fallbackRecentEnrollments].slice(0, 3);
  const normalizedActiveEnrollments = Math.max(activeEnrollmentCount ?? enrollmentRows.length, confirmedCourseOrders.length);
  const webinarMetricItems = webinarMetricRows ?? [];
  const paidWebinarOrdersCount = webinarMetricItems.filter((item) => item.payment_status === "paid").length;
  const normalizedActiveWebinarRegistrations = webinarMetricItems.filter((item) => item.registration_status === "registered").length;
  const freeWebinarRegistrationsCount = webinarMetricItems.filter((item) => {
    const webinar = Array.isArray(item.webinars) ? item.webinars[0] : item.webinars;
    return item.payment_status === "not_required" || webinar?.webinar_mode === "free";
  }).length;
  const upcomingWebinarsCount = webinarMetricItems.filter((item) => {
    const webinar = Array.isArray(item.webinars) ? item.webinars[0] : item.webinars;
    if (!webinar?.starts_at) return false;
    return item.registration_status === "registered" && new Date(webinar.starts_at).getTime() > Date.now();
  }).length;

  const approvalStatus = profile.approval_status ?? "pending";
  const isRejected = approvalStatus === "rejected";
  const isPending = approvalStatus === "pending";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {profile.full_name ?? "Student"}</h1>
          <p className="mt-1 text-sm text-slate-600">Track your account status, inquiries, enrollments, purchases, and test activity.</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-sm">
          Account status: <span className={`font-semibold ${statusTone(approvalStatus)}`}>{toTitleCase(approvalStatus)}</span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4">
        {isPending ? (
          <div>
            <h2 className="text-lg font-semibold text-amber-700">Profile Under Review</h2>
            <p className="mt-1 text-sm text-slate-700">
              Your profile is currently being verified. Some student features may stay limited until your account is approved.
            </p>
          </div>
        ) : null}

        {isRejected ? (
          <div>
            <h2 className="text-lg font-semibold text-rose-700">Profile Rejected</h2>
            <p className="mt-1 text-sm text-slate-700">Please correct your profile details and resubmit your account for approval.</p>
            {profile.rejection_reason ? <p className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">Reason: {profile.rejection_reason}</p> : null}
          </div>
        ) : null}

        {approvalStatus === "approved" ? (
          <div>
            <h2 className="text-lg font-semibold text-emerald-700">Profile Approved</h2>
            <p className="mt-1 text-sm text-slate-700">Your account is active. You can access all student features.</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-800">Latest Identity Document</p>
          {latestIdentityDocument ? (
            <div className="mt-1 text-slate-700">
              <p>
                {toTitleCase(latestIdentityDocument.document_type)} · <span className={statusTone(latestIdentityDocument.status)}>{toTitleCase(latestIdentityDocument.status)}</span>
              </p>
              {latestIdentityDocument.rejection_reason ? <p className="text-rose-700">Reason: {latestIdentityDocument.rejection_reason}</p> : null}
              <p className="text-xs text-slate-500">Submitted: {formatDate(latestIdentityDocument.created_at)}</p>
            </div>
          ) : (
            <p className="mt-1 text-slate-600">No identity document uploaded yet.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/student/profile" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
            Update Profile
          </Link>
          <Link href="/student/approval-status" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            View Approval Status
          </Link>
          {isRejected ? (
            <Link href="/student/profile" className="rounded bg-emerald-600 px-3 py-2 text-sm text-white">
              Correct & Resubmit
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Overview</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-7">
          <Link href="/student/purchases?kind=course" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Paid Course Orders: <span className="font-semibold">{paidCourseOrders ?? 0}</span></Link>
          <Link href="/student/purchases?kind=psychometric" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Paid Psychometric Orders: <span className="font-semibold">{paidPsychometricOrders ?? 0}</span></Link>
          <Link href="/student/enrollments" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Active Enrollments: <span className="font-semibold">{normalizedActiveEnrollments}</span></Link>
          <Link href="/student/webinar-registrations?filter=all" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Active Webinar Registrations: <span className="font-semibold">{normalizedActiveWebinarRegistrations}</span></Link>
          <Link href="/student/webinar-registrations?filter=upcoming" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Upcoming Webinars: <span className="font-semibold">{upcomingWebinarsCount}</span></Link>
          <Link href="/student/purchases?kind=webinar" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Paid Webinar Orders: <span className="font-semibold">{paidWebinarOrdersCount}</span></Link>
          <Link href="/student/webinar-registrations?filter=free" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Free Webinar Registrations: <span className="font-semibold">{freeWebinarRegistrationsCount}</span></Link>
          <Link href="/student/purchases?kind=webinar-refunds" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Webinar Refund Requests: <span className="font-semibold">{webinarRefundRequestsCount ?? 0}</span></Link>
          <Link href="/student/leads" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">My Inquiries: <span className="font-semibold">{inquiryCount ?? 0}</span></Link>
          <Link href="/student/notifications" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Unread Notifications: <span className="font-semibold">{unreadNotificationCount ?? 0}</span></Link>
          <Link href="/student/purchases" className="rounded-xl border bg-white p-4 text-sm transition hover:border-brand-300">Open Refund Requests: <span className="font-semibold">{openRefundRequestsCount ?? 0}</span></Link>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/profile">Update Profile</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/approval-status">View Approval Status</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/leads">My Inquiries</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/enrollments">My Enrollments</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/tests">My Psychometric Tests</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/saved-courses">Saved</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/cart">Checkout Cart</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/courses">Browse Courses</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/webinars">Browse Webinars</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/psychometric-tests">Take Psychometric Test</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/student/purchases">View Purchases</Link>
          <Link className="rounded-xl border bg-white p-3 text-sm hover:border-brand-300" href="/refund-cancellation-policy">Refund Policy</Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Recent Notifications</h2>
            <Link href="/student/notifications" className="text-sm text-brand-700">
              View all notifications
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {(recentNotifications ?? []).length === 0 ? <p className="text-slate-500">No notifications yet.</p> : null}
            {(recentNotifications ?? []).map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="text-slate-700">{item.message}</p>
                <p className="text-xs text-slate-500">
                  {item.is_read ? "Read" : "Unread"} · {formatDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Inquiries</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(recentInquiries ?? []).length === 0 ? <p className="text-slate-500">You have not submitted any course inquiries yet.</p> : null}
            {(recentInquiries ?? []).map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">Course: {item.course_id ?? "N/A"}</p>
                {item.message ? <p className="text-slate-700">{item.message}</p> : null}
                <p className="text-xs text-slate-500">{formatDate(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Enrollments</h2>
          <div className="mt-3 space-y-2 text-sm">
            {mergedRecentEnrollments.length === 0 ? <p className="text-slate-500">No enrollments yet.</p> : null}
            {mergedRecentEnrollments.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">Course: {courseTitleMap.get(item.course_id) ?? item.course_id}</p>
                <p className="text-slate-700">Status: {toTitleCase(item.enrollment_status)}</p>
                <p className="text-xs text-slate-500">{formatDate(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Course Transactions</h2>
          <div className="mt-3 space-y-2 text-sm">
            {recentCourseTransactions.length === 0 ? <p className="text-slate-500">No course transactions yet.</p> : null}
            {recentCourseTransactions.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">Course: {courseTitleMap.get(item.course_id ?? "") ?? item.course_id ?? "-"}</p>
                <p className="text-slate-700">Payment: {toTitleCase(item.payment_status ?? "created")}</p>
                <p className="text-xs text-slate-500">{formatDate(item.paid_at ?? item.created_at ?? new Date().toISOString())}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Test Attempts</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(recentTestAttempts ?? []).length === 0 ? <p className="text-slate-500">No psychometric attempts yet.</p> : null}
            {(recentTestAttempts ?? []).map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">Test: {item.test_id}</p>
                <p className="text-slate-700">Status: {toTitleCase(item.status)} · Score: {item.score ?? "-"}</p>
                <p className="text-xs text-slate-500">{formatDate(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Webinar Registrations</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(recentWebinarRegistrations ?? []).length === 0 ? <p className="text-slate-500">No webinar registrations yet.</p> : null}
            {(recentWebinarRegistrations ?? []).map((item) => {
              const webinar = webinarInfo(item.webinars);
              return (
                <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">Webinar: {webinar?.title ?? item.webinar_id}</p>
                  <p className="text-slate-700">
                    Status: {toTitleCase(webinar?.status ?? item.registration_status)} · Mode: {toTitleCase(webinar?.webinar_mode ?? "unknown")}
                  </p>
                  <p className="text-slate-700">Access: {toTitleCase(item.access_status)} · Payment: {toTitleCase(item.payment_status)}</p>
                  <p className="text-slate-700">Provider: {webinar?.meeting_provider ?? "N/A"} · Institute: {extractInstituteName(webinar?.institutes) ?? "N/A"}</p>
                  {item.access_status === "granted" ? (
                    <a href={`/student/webinars/${item.webinar_id}/join`} className="mt-2 inline-flex rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
                      Join Webinar
                    </a>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {webinar?.starts_at ? `Starts: ${formatDate(webinar.starts_at)} · ` : ""}
                    Registered: {formatDate(item.created_at)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Webinar Transactions</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(recentWebinarTransactions ?? []).length === 0 ? <p className="text-slate-500">No webinar transactions yet.</p> : null}
            {(recentWebinarTransactions ?? []).map((item) => {
              const webinar = Array.isArray(item.webinars) ? item.webinars[0] : item.webinars;
              return (
                <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">Webinar: {webinar?.title ?? item.webinar_id}</p>
                  <p className="text-slate-700">
                    Status: {toTitleCase(webinar?.status ?? "unknown")} · Mode: {toTitleCase(webinar?.webinar_mode ?? "unknown")}
                  </p>
                  <p className="text-slate-700">Payment: {toTitleCase(item.payment_status ?? "pending")} · Amount: ₹{item.amount ?? 0}</p>
                  <p className="text-slate-700">Provider: {webinar?.meeting_provider ?? "N/A"} · Institute: {extractInstituteName(webinar?.institutes) ?? "N/A"}</p>
                  {(item.payment_status ?? "").toLowerCase() === "paid" ? (
                    <a href={`/student/webinars/${item.webinar_id}/join`} className="mt-2 inline-flex rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
                      Join Webinar
                    </a>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {webinar?.starts_at ? `Starts: ${formatDate(webinar.starts_at)} · ` : ""}
                    Transaction: {formatDate(item.paid_at ?? item.created_at)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Recent Refund Requests</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(recentRefundRequests ?? []).length === 0 ? <p className="text-slate-500">No refund requests yet.</p> : null}
            {(recentRefundRequests ?? []).map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="font-medium text-slate-900">
                  {toTitleCase(item.order_kind ?? "order")} · {item.amount ? `₹${item.amount}` : "Amount unavailable"}
                </p>
                <p className="text-slate-700">Status: {toTitleCase(item.refund_status)}</p>
                {item.reason ? <p className="text-slate-700">Reason: {item.reason}</p> : null}
                <p className="text-xs text-slate-500">
                  Requested: {formatDate(item.requested_at ?? item.created_at)}
                  {item.processed_at ? ` · Processed: ${formatDate(item.processed_at)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
