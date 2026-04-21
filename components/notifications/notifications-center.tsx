"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  priority: "low" | "normal" | "high" | "critical";
  is_read: boolean;
  read_at: string | null;
  target_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function priorityClasses(priority: NotificationItem["priority"]) {
  if (priority === "critical") return "bg-rose-100 text-rose-700";
  if (priority === "high") return "bg-amber-100 text-amber-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-brand-50 text-brand-700";
}

export function NotificationsCenter({
  initialNotifications,
  initialUnreadCount,
  backHref,
}: {
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
  backHref: string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();

  const hasItems = notifications.length > 0;
  const sorted = useMemo(
    () => [...notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notifications],
  );

  const runAction = (request: Promise<Response>, updater: () => void) => {
    startTransition(async () => {
      const result = await request;
      if (result.ok) {
        updater();
        router.refresh();
      }
    });
  };

  return (
    <div className="mt-6 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || unreadCount === 0}
          onClick={() =>
            runAction(fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_all_read" }) }), () => {
              setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true, read_at: new Date().toISOString() })));
              setUnreadCount(0);
            })
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Mark all as read
        </button>
        <button
          type="button"
          disabled={isPending || !hasItems}
          onClick={() =>
            runAction(fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive_all" }) }), () => {
              setNotifications([]);
              setUnreadCount(0);
            })
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Archive all
        </button>
      </div>

      {!hasItems ? <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No notifications yet.</div> : null}

      {sorted.map((item) => (
        <div key={item.id} className="rounded-xl border bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-900">{item.title}</p>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-1 text-xs ${item.is_read ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-700"}`}>
                {item.is_read ? "Read" : "Unread"}
              </span>
              <span className={`rounded px-2 py-1 text-xs ${priorityClasses(item.priority)}`}>{item.priority}</span>
            </div>
          </div>
          <p className="mt-2 text-slate-700">{item.message}</p>
          <p className="mt-2 text-xs text-slate-500">{formatDate(item.created_at)} · {item.category} · {item.type}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.target_url ? (
              <Link href={item.target_url} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                {item.action_label || "Open"}
              </Link>
            ) : null}
            {!item.is_read ? (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() =>
                  runAction(
                    fetch(`/api/notifications/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "mark_read" }),
                    }),
                    () => {
                      setNotifications((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row)));
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    },
                  )
                }
              >
                Mark read
              </button>
            ) : null}
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() =>
                runAction(
                  fetch(`/api/notifications/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "dismiss" }),
                  }),
                  () => setNotifications((prev) => prev.filter((row) => row.id !== item.id)),
                )
              }
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      <div className="mt-6">
        <Link href={backHref} className="text-sm text-brand-700">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
