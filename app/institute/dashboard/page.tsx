import Link from "next/link";

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
      .select("id,title,approval_status,fee_amount,created_at,start_date")
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
      .select("id,course_id,payment_status,final_paid_amount,platform_commission_amount,institute_receivable_amount,created_at")
      .eq("institute_id", institute.id)
      .order("created_at", { ascending: false }),
    dataClient
      .from("institute_payouts")
      .select("id,amount_payable,payout_status,created_at,paid_at")
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

  const approvedCourses = courses.filter((course) => course.approval_status === "approved").length;
  const pendingCourses = courses.filter((course) => course.approval_status === "pending").length;

  const paidOrders = orderRows.filter((order) => order.payment_status === "paid");
  const totalGrossRevenue = paidOrders.reduce((sum, order) => sum + Number(order.final_paid_amount ?? 0), 0);
  const totalCommission = paidOrders.reduce((sum, order) => sum + Number(order.platform_commission_amount ?? 0), 0);
  const totalNetEarnings = paidOrders.reduce((sum, order) => sum + Number(order.institute_receivable_amount ?? 0), 0);

  const totalPayoutsPaid = payouts
    .filter((payout) => payout.payout_status === "paid")
    .reduce((sum, payout) => sum + Number(payout.amount_payable ?? 0), 0);
  const pendingPayouts = payouts
    .filter((payout) => payout.payout_status === "pending" || payout.payout_status === "processing")
    .reduce((sum, payout) => sum + Number(payout.amount_payable ?? 0), 0);

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
        <div className="rounded border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Courses</p>
          <p className="mt-1 text-2xl font-semibold">{courses.length}</p>
          <p className="mt-1 text-xs text-slate-600">{approvedCourses} approved · {pendingCourses} pending</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads</p>
          <p className="mt-1 text-2xl font-semibold">{leads.length}</p>
          <p className="mt-1 text-xs text-slate-600">{leadsThisMonth} in the last 30 days</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Enrollments</p>
          <p className="mt-1 text-2xl font-semibold">{enrollmentsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-600">{paidOrdersThisMonth} paid orders in the last 30 days</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Wallet balance</p>
          <p className="mt-1 text-2xl font-semibold">{money(walletBalance)}</p>
          <p className="mt-1 text-xs text-slate-600">Pending payouts: {money(pendingPayouts)}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unread notifications</p>
          <p className="mt-1 text-2xl font-semibold">{unreadNotificationsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-600">Institute alerts and moderation updates</p>
        </div>
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
            <Link href="/institute/courses#create-course" className="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">
              Add new course
            </Link>
            <Link href="/institute/courses" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Manage courses (edit/delete)
            </Link>
            <Link href="/institute/leads" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Review leads
            </Link>
            <Link href="/institute/enrollments" className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
              Track enrollments
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
          </div>
          <p className="mt-3 text-xs text-slate-500">Institute account created on {new Date(institute.created_at).toLocaleDateString("en-IN")}.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
                <p className="font-medium">{course.title}</p>
                <p className="text-slate-600">
                  {course.approval_status} · ₹{course.fee_amount} · Starts {course.start_date ?? "TBA"}
                </p>
              </div>
            ))}
            {courses.length === 0 ? <p className="text-slate-600">No courses yet.</p> : null}
            {courses.length === 0 ? (
              <Link
                href="/institute/courses#create-course"
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
