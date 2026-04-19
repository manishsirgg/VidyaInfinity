import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type NotificationFeedItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function AdminNotificationsPage() {
  const { user } = await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }
  const supabase = admin.data;

  const [{ data: notifications }, { count: unreadCount }, { data: pendingCourses, count: pendingCoursesCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    supabase
      .from("courses")
      .select("id,title,created_at", { count: "exact" })
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const moderationNotifications: NotificationFeedItem[] = (pendingCourses ?? []).map((course) => ({
    id: `course-moderation-${course.id}`,
    title: "Course moderation pending",
    message: `Course "${course.title}" is waiting for admin approval.`,
    type: "resubmission",
    is_read: false,
    created_at: course.created_at,
  }));

  const feed = ([...(notifications ?? []), ...moderationNotifications] satisfies NotificationFeedItem[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const totalUnread = (unreadCount ?? 0) + (pendingCoursesCount ?? 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">Stay updated on moderation updates, account workflows, and platform alerts.</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-sm">
          Unread: <span className="font-semibold">{totalUnread}</span>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {feed.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No notifications yet.</div>
        ) : null}

        {feed.map((item) => (
          <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-900">{item.title}</p>
              <span className={`rounded px-2 py-1 text-xs ${item.is_read ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-700"}`}>
                {item.is_read ? "Read" : "Unread"}
              </span>
            </div>
            <p className="mt-2 text-slate-700">{item.message}</p>
            <p className="mt-2 text-xs text-slate-500">
              {formatDate(item.created_at)} · Type: {item.type}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Link href="/admin/dashboard" className="text-sm text-brand-700">
          Back to dashboard
        </Link>
        <Link href="/admin/courses" className="text-sm text-brand-700">
          Open course moderation
        </Link>
      </div>
    </div>
  );
}
