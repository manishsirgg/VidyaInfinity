import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function StudentNotificationsPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">Stay updated on approvals, profile review updates, and account activity.</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-sm">Unread: <span className="font-semibold">{unreadCount ?? 0}</span></div>
      </div>

      <div className="mt-6 space-y-2">
        {(notifications ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No notifications yet.</div>
        ) : null}

        {(notifications ?? []).map((item) => (
          <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-900">{item.title}</p>
              <span className={`rounded px-2 py-1 text-xs ${item.is_read ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-700"}`}>
                {item.is_read ? "Read" : "Unread"}
              </span>
            </div>
            <p className="mt-2 text-slate-700">{item.message}</p>
            <p className="mt-2 text-xs text-slate-500">{formatDate(item.created_at)} · Type: {item.type}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/student/dashboard" className="text-sm text-brand-700">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
