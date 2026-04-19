import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
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

  const [coursesResult, leadsResult, enrollmentsResult, orderResult, payoutsResult, unreadNotificationsResult, recentNotificationsResult] = await Promise.all([
    dataClient
      .from("courses")
      .select("id,title,status,fees,created_at,start_date,rejection_reason")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("leads")
      .select("id,name,email,phone,created_at,course_id,courses!inner(title,institute_id)")
      .eq("courses.institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient.from("course_enrollments").select("id", { count: "exact", head: true }).eq("institute_id", institute.id),
    dataClient
      .from("course_orders")
      .select("id,course_id,payment_status,gross_amount,platform_fee_amount,institute_receivable_amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("institute_payouts")
      .select("id,payout_amount,payout_status,created_at,processed_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    dataClient
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const courses = coursesResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const orderRows = orderResult.data ?? [];
  const payouts = payoutsResult.data ?? [];
  const recentNotifications = recentNotificationsResult.data ?? [];

  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;

  const approvedCourses = courses.filter((course) => course.status === "approved").length;
  const pendingCourses = courses.filter((course) => course.status === "pending").length;
  const rejectedCourses = courses.filter((course) => course.status === "rejected");

  const paidOrders = orderRows.filter((order) => order.payment_status === "paid");
  const totalGrossRevenue = paidOrders.reduce((sum, order) => sum + Number(order.gross_amount ?? 0), 0);
  const totalCommission = paidOrders.reduce((sum, order) => sum + Number(order.platform_fee_amount ?? 0), 0);
  const totalNetEarnings = paidOrders.reduce((sum, order) => sum + Number(order.institute_receivable_amount ?? 0), 0);

  const totalPayoutsPaid = payouts
    .filter((payout) => payout.payout_status === "paid")
    .reduce((sum, payout) => sum + Number(payout.payout_amount ?? 0), 0);
  const pendingPayouts = payouts
    .filter((payout) => payout.payout_status === "pending" || payout.payout_status === "processing")
    .reduce((sum, payout) => sum + Number(payout.payout_amount ?? 0), 0);

  const walletBalance = Math.max(totalNetEarnings - totalPayoutsPaid, 0);

  const leadsThisMonth = leads.filter((lead) => now - new Date(lead.created_at).getTime() <= days30).length;
  const paidOrdersThisMonth = paidOrders.filter((order) => now - new Date(order.created_at).getTime() <= days30).length;

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
              Manage courses (edit/delete)
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
            <Link href="/institute/featured" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Activate featured listing
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">Institute account created on {new Date(institute.created_at).toLocaleDateString("en-IN")}.</p>
        </div>
      </div>

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
