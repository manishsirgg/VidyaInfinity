import { NotificationsCenter } from "@/components/notifications/notifications-center";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminNotificationsPage() {
  const { user } = await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);
  const supabase = admin.data;
  const nowIso = new Date().toISOString();

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,message,type,category,priority,is_read,read_at,target_url,action_label,entity_type,entity_id,metadata,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">See moderation queue alerts, transactions, refunds, and platform events.</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-sm">Unread: <span className="font-semibold">{unreadCount ?? 0}</span></div>
      </div>
      <NotificationsCenter initialNotifications={notifications ?? []} initialUnreadCount={unreadCount ?? 0} backHref="/admin/dashboard" />
    </div>
  );
}
