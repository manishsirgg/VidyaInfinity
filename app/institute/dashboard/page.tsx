import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { loadInstituteWalletSnapshot } from "@/lib/institute/payouts";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

type FeaturedPlanSummary = {
  id: string;
  label: string;
  price: number;
  currency: string;
  durationDays: number;
  sortOrder: number;
};

function parseFeaturedPlanRows(rows: Array<Record<string, unknown>> | null | undefined, fallbackLabel: string) {
  return (rows ?? [])
    .map((row) => ({
      id: String(row.id ?? ""),
      label: String(row.name ?? row.label ?? row.plan_code ?? row.code ?? fallbackLabel),
      price: Number(row.price ?? row.amount ?? 0),
      currency: String(row.currency ?? "INR"),
      durationDays: Number(row.duration_days ?? 0),
      sortOrder: Number(row.sort_order ?? row.tier_rank ?? 0),
    }))
    .filter((row) => Boolean(row.id))
    .sort((left, right) => left.sortOrder - right.sortOrder) satisfies FeaturedPlanSummary[];
}

export default async function InstituteDashboardPage() {
  const { user, profile } = await requireUser("institute");
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: instituteRows, error: instituteError } = await dataClient
    .from("institutes")
    .select("id,name,status,rejection_reason,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (instituteError) {
    console.error("Failed to load institute dashboard record", {
      userId: user.id,
      error: instituteError.message,
    });
  }

  const institute = instituteRows?.[0] ?? null;

  if (!institute) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Institute Dashboard</h1>
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          Institute onboarding record not found. Please contact support.
        </p>
      </div>
    );
  }

  const [coursesResult, leadsResult, enrollmentsResult, orderResult, walletSnapshotResult, unreadNotificationsResult, recentNotificationsResult, featuredStatusResult, courseFeaturedSummaryResult, webinarFeaturedSummaryResult, webinarsResult, webinarRegistrationsResult, webinarOrdersResult, instituteFeaturedPlansResult, courseFeaturedPlansResult, webinarFeaturedPlansResult, instituteFeaturedOrdersResult, courseFeaturedOrdersResult, webinarFeaturedOrdersResult] = await Promise.all([
    dataClient
      .from("courses")
      .select("id,title,status,fees,created_at,start_date,rejection_reason")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("leads")
      .select("id,name,email,phone,created_at,course_id,webinar_id,lead_type,lead_target")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("institute_id", institute.id),
    dataClient
      .from("course_orders")
      .select("id,course_id,payment_status,gross_amount,platform_fee_amount,institute_receivable_amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    loadInstituteWalletSnapshot(institute.id, { payoutHistoryLimit: 5 }),
    dataClient.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    dataClient
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    dataClient
      .from("active_institute_featured_status")
      .select("plan_code,starts_at,ends_at")
      .eq("institute_id", institute.id)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ plan_code: string; starts_at: string; ends_at: string }>(),
    dataClient
      .from("course_featured_subscription_summary")
      .select("course_id,status,starts_at,ends_at")
      .eq("institute_id", institute.id),
    dataClient
      .from("webinar_featured_subscription_summary")
      .select("webinar_id,status,starts_at,ends_at")
      .eq("institute_id", institute.id),
    dataClient
      .from("webinars")
      .select("id,title,status,approval_status,starts_at,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient.from("webinar_registrations").select("id,payment_status,registration_status,access_status").eq("institute_id", institute.id),
    dataClient
      .from("webinar_orders")
      .select("id,payment_status,payout_amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient.from("featured_listing_plans").select("id,name,label,plan_code,code,price,amount,currency,duration_days,sort_order,tier_rank").eq("is_active", true).order("sort_order", { ascending: true }),
    dataClient.from("course_featured_plans").select("id,name,plan_code,code,price,amount,currency,duration_days,sort_order,tier_rank").eq("is_active", true).order("sort_order", { ascending: true }),
    dataClient.from("webinar_featured_plans").select("id,name,plan_code,code,price,amount,currency,duration_days,sort_order,tier_rank").eq("is_active", true).order("sort_order", { ascending: true }),
    dataClient
      .from("featured_listing_orders")
      .select("id,payment_status,amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("course_featured_orders")
      .select("id,course_id,payment_status,amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("webinar_featured_orders")
      .select("id,webinar_id,payment_status,amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
  ]);

  const courses = coursesResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const orderRows = orderResult.data ?? [];
  const walletSummary = walletSnapshotResult.data?.summary ?? {
    gross_revenue: 0,
    platform_fee: 0,
    refunded_amount: 0,
    net_earnings: 0,
    pending_clearance: 0,
    available_balance: 0,
    locked_balance: 0,
    paid_out: 0,
  };
  if (walletSnapshotResult.error) {
    console.error("Failed to load institute wallet summary for dashboard", {
      instituteId: institute.id,
      error: walletSnapshotResult.error,
    });
  }
  const recentNotifications = recentNotificationsResult.data ?? [];
  const activeFeaturedStatus = featuredStatusResult.data ?? null;
  const webinars = webinarsResult.data ?? [];
  const webinarRegistrationRows = (webinarRegistrationsResult.data ?? []) as Array<{ id: string; payment_status: string | null; registration_status: string | null; access_status: string | null }>;
  const webinarActiveRegistrations = webinarRegistrationRows.filter((row) => {
    const reg = String(row.registration_status ?? "").toLowerCase();
    const pay = String(row.payment_status ?? "").toLowerCase();
    const access = String(row.access_status ?? "").toLowerCase();
    return reg === "registered" && pay === "paid" && !["revoked", "cancelled", "canceled", "refunded"].includes(access);
  });
  const webinarRegistrationsCount = webinarActiveRegistrations.length;
  const webinarPaidRegistrationsCount = webinarActiveRegistrations.length;
  const webinarOrders = webinarOrdersResult.data ?? [];
  const courseFeaturedRows =
    (courseFeaturedSummaryResult.data as Array<{ course_id: string; status: string; starts_at: string; ends_at: string }> | null) ?? [];
  const webinarFeaturedRows =
    (webinarFeaturedSummaryResult.data as Array<{ webinar_id: string; status: string; starts_at: string; ends_at: string }> | null) ?? [];
  const instituteFeaturedPlans = parseFeaturedPlanRows(instituteFeaturedPlansResult.data as Array<Record<string, unknown>> | null, "Institute Featured");
  const courseFeaturedPlans = parseFeaturedPlanRows(courseFeaturedPlansResult.data as Array<Record<string, unknown>> | null, "Course Featured");
  const webinarFeaturedPlans = parseFeaturedPlanRows(webinarFeaturedPlansResult.data as Array<Record<string, unknown>> | null, "Webinar Featured");
  const instituteFeaturedOrders = (instituteFeaturedOrdersResult.data ?? []) as Array<{ id: string; payment_status: string; amount: number | null; created_at: string }>;
  const courseFeaturedOrders = (courseFeaturedOrdersResult.data ?? []) as Array<{ id: string; course_id: string; payment_status: string; amount: number | null; created_at: string }>;
  const webinarFeaturedOrders = (webinarFeaturedOrdersResult.data ?? []) as Array<{ id: string; webinar_id: string; payment_status: string; amount: number | null; created_at: string }>;

  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;

  const approvedCourses = courses.filter((course) => course.status === "approved").length;
  const pendingCourses = courses.filter((course) => course.status === "pending").length;
  const rejectedCourses = courses.filter((course) => course.status === "rejected");

  const paidOrders = orderRows.filter((order) => isSuccessfulPaymentStatus(order.payment_status));
  const totalGrossRevenue = Number(walletSummary.gross_revenue ?? 0);
  const totalCommission = Number(walletSummary.platform_fee ?? 0);
  const totalRefundedAmount = Number(walletSummary.refunded_amount ?? 0);
  const totalNetEarnings = Number(walletSummary.net_earnings ?? 0);
  const totalPayoutsPaid = Number(walletSummary.paid_out ?? 0);
  const pendingPayouts = Number(walletSummary.locked_balance ?? 0);
  const walletBalance = Number(walletSummary.available_balance ?? 0);

  const leadsThisMonth = leads.filter((lead) => now - new Date(lead.created_at).getTime() <= days30).length;
  const paidOrdersThisMonth = paidOrders.filter((order) => now - new Date(order.created_at).getTime() <= days30).length;
  const activeCourseFeatured = courseFeaturedRows.filter((row) => row.status === "active" && new Date(row.starts_at).getTime() <= now && new Date(row.ends_at).getTime() > now).length;
  const scheduledCourseFeatured = courseFeaturedRows.filter((row) => row.status === "scheduled" && new Date(row.starts_at).getTime() > now).length;
  const activeWebinarFeatured = webinarFeaturedRows.filter((row) => row.status === "active" && new Date(row.starts_at).getTime() <= now && new Date(row.ends_at).getTime() > now).length;
  const scheduledWebinarFeatured = webinarFeaturedRows.filter((row) => row.status === "scheduled" && new Date(row.starts_at).getTime() > now).length;
  const approvedWebinars = webinars.filter((webinar) => webinar.approval_status === "approved").length;
  const pendingWebinars = webinars.filter((webinar) => webinar.approval_status === "pending").length;
  const liveWebinars = webinars.filter((webinar) => webinar.status === "live").length;
  const webinarPaidOrders = webinarOrders.filter((order) => isSuccessfulPaymentStatus(order.payment_status));
  const webinarPayoutTotal = webinarPaidOrders.reduce((sum, order) => sum + Number(order.payout_amount ?? 0), 0);
  const paidInstituteFeaturedOrders = instituteFeaturedOrders.filter((order) => isSuccessfulPaymentStatus(order.payment_status));
  const paidCourseFeaturedOrders = courseFeaturedOrders.filter((order) => isSuccessfulPaymentStatus(order.payment_status));
  const paidWebinarFeaturedOrders = webinarFeaturedOrders.filter((order) => isSuccessfulPaymentStatus(order.payment_status));
  const instituteFeaturedSpend = paidInstituteFeaturedOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const courseFeaturedSpend = paidCourseFeaturedOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const webinarFeaturedSpend = paidWebinarFeaturedOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const currentlyFeaturedCourseIds = Array.from(
    new Set(
      courseFeaturedRows
        .filter((row) => row.status === "active" && new Date(row.starts_at).getTime() <= now && new Date(row.ends_at).getTime() > now)
        .map((row) => row.course_id),
    ),
  );
  const currentlyFeaturedWebinarIds = Array.from(
    new Set(
      webinarFeaturedRows
        .filter((row) => row.status === "active" && new Date(row.starts_at).getTime() <= now && new Date(row.ends_at).getTime() > now)
        .map((row) => row.webinar_id),
    ),
  );
  const featuredCourseTitles = courses
    .filter((course) => currentlyFeaturedCourseIds.includes(course.id))
    .map((course) => course.title)
    .slice(0, 5);
  const featuredWebinarTitles = webinars
    .filter((webinar) => currentlyFeaturedWebinarIds.includes(webinar.id))
    .map((webinar) => webinar.title)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Institute Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome back, {profile.full_name}. Monitor courses, leads, admissions, payouts, and overall institute
            performance from one place.
          </p>
        </div>
        <div className="rounded border bg-white px-4 py-2 text-sm">
          <p className="font-medium">{institute.name}</p>
          <p className="text-slate-600">{profile.city ?? "City not set"}</p>
          <p className="text-slate-600">Status: {institute.status}</p>
        </div>
      </div>

      {institute.rejection_reason ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Last moderation note: {institute.rejection_reason}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/institute/courses/manage" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Courses</p>
          <p className="mt-1 text-2xl font-semibold">{courses.length}</p>
          <p className="mt-1 text-xs text-slate-600">
            {approvedCourses} approved · {pendingCourses} pending · {rejectedCourses.length} rejected (awaiting
            resubmission)
          </p>
        </Link>
        <Link href="/institute/leads" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads</p>
          <p className="mt-1 text-2xl font-semibold">{leads.length}</p>
          <p className="mt-1 text-xs text-slate-600">{leadsThisMonth} in the last 30 days</p>
        </Link>
        <Link href="/institute/enrollments" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Enrollments</p>
          <p className="mt-1 text-2xl font-semibold">{enrollmentsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-600">{paidOrdersThisMonth} paid orders in the last 30 days</p>
        </Link>
        <Link href="/institute/wallet" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Wallet balance</p>
          <p className="mt-1 text-2xl font-semibold">{money(walletBalance)}</p>
          <p className="mt-1 text-xs text-slate-600">Pending payouts: {money(pendingPayouts)}</p>
        </Link>
        <Link href="/institute/notifications" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unread notifications</p>
          <p className="mt-1 text-2xl font-semibold">{unreadNotificationsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-600">Institute alerts and moderation updates</p>
        </Link>
        <Link href="/institute/webinars" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Webinars</p>
          <p className="mt-1 text-2xl font-semibold">{webinars.length}</p>
          <p className="mt-1 text-xs text-slate-600">
            {approvedWebinars} approved · {pendingWebinars} pending · {liveWebinars} live
          </p>
        </Link>
        <Link href="/institute/webinars" className="rounded border bg-white p-4 transition hover:border-brand-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Webinar registrations</p>
          <p className="mt-1 text-2xl font-semibold">{webinarRegistrationsCount}</p>
          <p className="mt-1 text-xs text-slate-600">Paid registrations: {webinarPaidRegistrationsCount} · Webinar payouts: {money(webinarPayoutTotal)}</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Revenue analytics</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Gross revenue</dt>
              <dd className="font-medium">{money(totalGrossRevenue)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Platform commission</dt>
              <dd className="font-medium">{money(totalCommission)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Net earnings</dt>
              <dd className="font-medium">{money(totalNetEarnings)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Refunded amount</dt>
              <dd className="font-medium">{money(totalRefundedAmount)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Payouts released</dt>
              <dd className="font-medium">{money(totalPayoutsPaid)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded border bg-white p-4 lg:col-span-2">
          <h2 className="text-base font-semibold">Quick actions</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/institute/courses/new" className="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">
              Add new course
            </Link>
            <Link href="/institute/courses/manage" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Manage courses (edit/archive)
            </Link>
            <Link href="/institute/courses/rejected" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Rejected courses &amp; resubmission
            </Link>
            <Link href="/institute/leads" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Review leads
            </Link>
            <Link href="/institute/enrollments" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Track enrollments
            </Link>
            <Link href="/institute/wallet" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Wallet balance & payouts
            </Link>
            <Link href="/institute/profile" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Update institute profile
            </Link>
            <Link href="/institute/notifications" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              View notifications
            </Link>
            <Link href="/institute/kyc" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              KYC and business docs
            </Link>
            <Link href="/institute/webinars" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Schedule live webinars
            </Link>
            <Link href="/institute/webinars/new" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Schedule webinar now
            </Link>
            <Link href="/institute/featured" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Activate featured listing
            </Link>
            <Link href="/institute/courses/featured" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Feature courses
            </Link>
            <Link href="/institute/webinars/featured" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Promote webinars
            </Link>
          </div>
          <div className="mt-3 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
            {activeFeaturedStatus ? (
              <p>
                Featured listing active ({activeFeaturedStatus.plan_code}) until{" "}
                {new Date(activeFeaturedStatus.ends_at).toLocaleDateString("en-IN")}.
              </p>
            ) : (
              <p>No active featured listing. Activate a plan to boost public visibility.</p>
            )}
          </div>
          <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>
              Course featured status: {activeCourseFeatured} active · {scheduledCourseFeatured} scheduled.
            </p>
            <p className="mt-1">
              Webinar featured status: {activeWebinarFeatured} active · {scheduledWebinarFeatured} scheduled.
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-500">Institute account created on {new Date(institute.created_at).toLocaleDateString("en-IN")}.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Webinar performance</h2>
            <Link href="/institute/webinars" className="text-sm text-brand-700">
              Open webinar manager
            </Link>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Total webinars</dt>
              <dd className="font-medium">{webinars.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Registrations</dt>
              <dd className="font-medium">{webinarRegistrationsCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Paid webinar registrations</dt>
              <dd className="font-medium">{webinarPaidRegistrationsCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Webinar payout total</dt>
              <dd className="font-medium">{money(webinarPayoutTotal)}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Featured promotion overview</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              Institute featured listing:{" "}
              {activeFeaturedStatus
                ? `Active (${activeFeaturedStatus.plan_code}) until ${new Date(activeFeaturedStatus.ends_at).toLocaleDateString("en-IN")}`
                : "Not active"}
            </p>
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              Course featured listing: {activeCourseFeatured} active · {scheduledCourseFeatured} scheduled
            </p>
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              Webinar featured promotion: {activeWebinarFeatured} active · {scheduledWebinarFeatured} scheduled
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded border bg-white p-4">
        <h2 className="text-base font-semibold">Featured listing metrics & plans</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 text-sm">
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Institute featured paid orders: <span className="font-semibold">{paidInstituteFeaturedOrders.length}</span></p>
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Institute featured spend: <span className="font-semibold">{money(instituteFeaturedSpend)}</span></p>
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Course featured paid orders: <span className="font-semibold">{paidCourseFeaturedOrders.length}</span></p>
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Course featured spend: <span className="font-semibold">{money(courseFeaturedSpend)}</span></p>
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Webinar featured paid orders: <span className="font-semibold">{paidWebinarFeaturedOrders.length}</span></p>
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2">Webinar featured spend: <span className="font-semibold">{money(webinarFeaturedSpend)}</span></p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2 text-sm">
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="font-medium text-emerald-900">Currently featured courses ({currentlyFeaturedCourseIds.length})</p>
            <p className="mt-1 text-emerald-800">{featuredCourseTitles.length > 0 ? featuredCourseTitles.join(", ") : "None currently active."}</p>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="font-medium text-emerald-900">Currently featured webinars ({currentlyFeaturedWebinarIds.length})</p>
            <p className="mt-1 text-emerald-800">{featuredWebinarTitles.length > 0 ? featuredWebinarTitles.join(", ") : "None currently active."}</p>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Plan pricing is now available on your dashboard for institute visibility, course featured slots, and webinar promotions.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Institute feature plan</p>
              <Link href="/institute/featured" className="text-xs text-brand-700 hover:underline">
                Manage
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {instituteFeaturedPlans.map((plan) => (
                <div key={plan.id} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <p className="font-medium">{plan.label}</p>
                  <p className="text-brand-700">{money(plan.price)} · {plan.durationDays} days</p>
                </div>
              ))}
              {instituteFeaturedPlans.length === 0 ? <p className="text-xs text-slate-600">No active institute featured plans.</p> : null}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Course featured listing plan</p>
              <Link href="/institute/courses/featured" className="text-xs text-brand-700 hover:underline">
                Manage
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {courseFeaturedPlans.map((plan) => (
                <div key={plan.id} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <p className="font-medium">{plan.label}</p>
                  <p className="text-brand-700">{money(plan.price)} · {plan.durationDays} days</p>
                </div>
              ))}
              {courseFeaturedPlans.length === 0 ? <p className="text-xs text-slate-600">No active course featured plans.</p> : null}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Webinar featured listing plan</p>
              <Link href="/institute/webinars/featured" className="text-xs text-brand-700 hover:underline">
                Manage
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {webinarFeaturedPlans.map((plan) => (
                <div key={plan.id} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <p className="font-medium">{plan.label}</p>
                  <p className="text-brand-700">{money(plan.price)} · {plan.durationDays} days</p>
                </div>
              ))}
              {webinarFeaturedPlans.length === 0 ? <p className="text-xs text-slate-600">No active webinar featured plans.</p> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Rejected courses</h2>
            <Link href="/institute/courses/rejected" className="text-sm text-brand-700">
              Fix and resubmit
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {rejectedCourses.slice(0, 5).map((course) => (
              <div key={course.id} className="rounded border px-3 py-2">
                <Link href={`/institute/courses/${course.id}`} className="font-medium text-brand-700 hover:underline">{course.title}</Link>
                <p className="mt-1 text-slate-600">Reason: {course.rejection_reason ?? "Rejected by moderator"}</p>
                <p className="mt-1 text-xs text-slate-500">Update the course, then resubmit for moderation.</p>
              </div>
            ))}
            {rejectedCourses.length === 0 ? <p className="text-slate-600">No rejected courses at the moment.</p> : null}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Recent notifications</h2>
            <Link href="/institute/notifications" className="text-sm text-brand-700">
              View all notifications
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {recentNotifications.length === 0 ? <p className="text-slate-600">No notifications yet.</p> : null}
            {recentNotifications.map((item) => (
              <div key={item.id} className="rounded border px-3 py-2">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-600">{item.message}</p>
                <p className="text-xs text-slate-500">
                  {item.is_read ? "Read" : "Unread"} · {formatDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Recent courses</h2>
          <div className="mt-3 space-y-2 text-sm">
            {courses.slice(0, 5).map((course) => (
              <div key={course.id} className="rounded border px-3 py-2">
                <Link href={`/institute/courses/${course.id}`} className="font-medium text-brand-700 hover:underline">{course.title}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
                  <StatusBadge status={course.status} />
                  <span>₹{course.fees}</span>
                  <span>Starts {course.start_date ?? "TBA"}</span>
                </div>
              </div>
            ))}
            {courses.length === 0 ? <p className="text-slate-600">No courses yet.</p> : null}
            {courses.length === 0 ? (
              <Link
                href="/institute/courses/new"
                className="inline-flex w-fit rounded border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
              >
                Add your first course
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Latest leads</h2>
          <div className="mt-3 space-y-2 text-sm">
            {leads.slice(0, 6).map((lead) => (
              <div key={lead.id} className="rounded border px-3 py-2">
                <p className="font-medium">{lead.name}</p>
                <p className="text-slate-600">{lead.email} · {lead.phone}</p>
              </div>
            ))}
            {leads.length === 0 ? <p className="text-slate-600">No leads yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
