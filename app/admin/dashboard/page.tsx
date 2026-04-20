import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const adminModules = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/institutes", label: "Institutes" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/commission", label: "Commission" },
  { href: "/admin/blogs", label: "Blogs" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/crm", label: "CRM Leads" },
  { href: "/admin/psychometric-tests", label: "Psychometric Tests" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/webinars", label: "Webinars" },
  { href: "/admin/featured-listings", label: "Featured Listings" },
  { href: "/admin/featured-listings", label: "Webinar Promotions" },
  { href: "/admin/profile", label: "Admin Profile" },
];

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function AdminDashboardPage() {
  const { user } = await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }
  const supabase = admin.data;

  const [
    { count: users },
    { count: institutes },
    { count: pendingUsers },
    { count: pendingInstitutes },
    { count: pendingCourses },
    { count: orders },
    { count: refunds },
    { count: blogs },
    { count: coupons },
    { count: leads },
    { count: tests },
    { count: unreadNotifications },
    { count: webinarCount },
    { count: webinarPendingCount },
    { count: webinarRegistrationCount },
    { count: webinarOrderCount },
    { count: instituteFeaturedSubscriptionsCount },
    { count: courseFeaturedSubscriptionsCount },
    { count: webinarFeaturedSubscriptionsCount },
    { data: recentNotifications },
    { data: recentPendingCourses },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("institutes").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["student", "admin"]).eq("approval_status", "pending"),
    supabase.from("institutes").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("course_orders").select("id", { count: "exact", head: true }),
    supabase.from("refunds").select("id", { count: "exact", head: true }).eq("refund_status", "requested"),
    supabase.from("blogs").select("id", { count: "exact", head: true }),
    supabase.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("crm_leads").select("id", { count: "exact", head: true }),
    supabase.from("psychometric_tests").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    supabase.from("webinars").select("id", { count: "exact", head: true }),
    supabase.from("webinars").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabase.from("webinar_registrations").select("id", { count: "exact", head: true }),
    supabase.from("webinar_orders").select("id", { count: "exact", head: true }),
    supabase.from("institute_featured_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("course_featured_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("webinar_featured_subscriptions").select("id", { count: "exact", head: true }),
    supabase
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("courses").select("id,title,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
  ]);

  const moderationNotifications = (recentPendingCourses ?? []).map((course) => ({
    id: `course-moderation-${course.id}`,
    title: "Course moderation pending",
    message: `Course "${course.title}" is waiting for admin approval.`,
    type: "resubmission",
    is_read: false,
    created_at: course.created_at,
  }));

  const recentNotificationFeed = [...(recentNotifications ?? []), ...moderationNotifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Link href="/admin/users" className="rounded border bg-white p-4 transition hover:border-brand-300">Profiles: {users ?? 0}</Link>
        <Link href="/admin/institutes" className="rounded border bg-white p-4 transition hover:border-brand-300">Institutes: {institutes ?? 0}</Link>
        <Link href="/admin/users" className="rounded border bg-white p-4">
          Pending user approvals: {pendingUsers ?? 0}
        </Link>
        <Link href="/admin/institutes" className="rounded border bg-white p-4">
          Pending institute approvals: {pendingInstitutes ?? 0}
        </Link>
        <Link href="/admin/courses" className="rounded border bg-white p-4">
          Pending course approvals: {pendingCourses ?? 0}
        </Link>
        <Link href="/admin/transactions" className="rounded border bg-white p-4 transition hover:border-brand-300">Course orders: {orders ?? 0}</Link>
        <Link href="/admin/refunds" className="rounded border bg-white p-4">
          Pending refunds: {refunds ?? 0}
        </Link>
        <Link href="/admin/blogs" className="rounded border bg-white p-4">
          Blogs: {blogs ?? 0}
        </Link>
        <Link href="/admin/coupons" className="rounded border bg-white p-4">
          Active coupons: {coupons ?? 0}
        </Link>
        <Link href="/admin/crm" className="rounded border bg-white p-4">
          CRM leads: {leads ?? 0}
        </Link>
        <Link href="/admin/psychometric-tests" className="rounded border bg-white p-4">
          Active tests: {tests ?? 0}
        </Link>
        <Link href="/admin/notifications" className="rounded border bg-white p-4">
          Unread notifications: {(unreadNotifications ?? 0) + (pendingCourses ?? 0)}
        </Link>
        <Link href="/admin/webinars" className="rounded border bg-white p-4">
          Webinar events: {webinarCount ?? 0}
        </Link>
        <Link href="/admin/webinars" className="rounded border bg-white p-4">
          Pending webinar approvals: {webinarPendingCount ?? 0}
        </Link>
        <Link href="/admin/webinars" className="rounded border bg-white p-4">
          Webinar registrations: {webinarRegistrationCount ?? 0}
        </Link>
        <Link href="/admin/webinars" className="rounded border bg-white p-4">
          Webinar orders: {webinarOrderCount ?? 0}
        </Link>
        <Link href="/admin/featured-listings" className="rounded border bg-white p-4">
          Institute featured listings: {instituteFeaturedSubscriptionsCount ?? 0}
        </Link>
        <Link href="/admin/featured-listings" className="rounded border bg-white p-4">
          Course featured listings: {courseFeaturedSubscriptionsCount ?? 0}
        </Link>
        <Link href="/admin/featured-listings" className="rounded border bg-white p-4">
          Webinar featured promotions: {webinarFeaturedSubscriptionsCount ?? 0}
        </Link>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminModules.map((module) => (
          <Link key={module.href} href={module.href} className="rounded border bg-white px-4 py-3 text-sm font-medium text-slate-700">
            Open {module.label}
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Recent Notifications</h2>
          <Link href="/admin/notifications" className="text-sm text-brand-700">
            View all notifications
          </Link>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {recentNotificationFeed.length === 0 ? <p className="text-slate-600">No notifications yet.</p> : null}
          {recentNotificationFeed.map((item) => (
            <div key={item.id} className="rounded border px-3 py-2">
              <p className="font-medium">{item.title}</p>
              <p className="text-slate-700">{item.message}</p>
              <p className="text-xs text-slate-500">
                {item.is_read ? "Read" : "Unread"} · {formatDate(item.created_at)}
              </p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
