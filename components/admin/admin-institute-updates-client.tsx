"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";

type UpdateRow = {
  id?: string;
  status?: string;
  content?: string;
  image_url?: string;
  video_url?: string;
  created_at?: string;
  institutes?: { name?: string };
};

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Pending review", value: "pending_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Hidden", value: "hidden" },
  { label: "Deleted", value: "deleted" },
];

const ACTIONS: Array<{ key: string; label: string; tone: string; needsReason?: boolean; confirm?: string }> = [
  { key: "approve", label: "Approve", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100" },
  { key: "reject", label: "Reject", tone: "bg-amber-50 text-amber-700 ring-amber-100 hover:bg-amber-100", needsReason: true },
  { key: "hide", label: "Hide", tone: "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200" },
  { key: "restore", label: "Restore", tone: "bg-sky-50 text-sky-700 ring-sky-100 hover:bg-sky-100" },
  { key: "delete", label: "Delete", tone: "bg-rose-50 text-rose-700 ring-rose-100 hover:bg-rose-100", confirm: "Delete this update permanently?" },
];

export function AdminInstituteUpdatesClient({ initialUpdates }: { initialUpdates: Array<Record<string, unknown>> }) {
  const [updates] = useState<UpdateRow[]>(initialUpdates as UpdateRow[]);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function act(id: string, action: string, needsReason = false, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const rejectionReason = needsReason ? window.prompt("Enter rejection reason") ?? "" : "";
    if (needsReason && !rejectionReason.trim()) {
      window.alert("Rejection reason is required.");
      return;
    }

    setPendingAction(`${id}:${action}`);
    try {
      const res = await fetch(`/api/admin/institute-updates/${id}/moderate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
      });
      if (!res.ok) {
        window.alert((await res.json()).error ?? "Failed");
        return;
      }
      window.location.reload();
    } finally {
      setPendingAction(null);
    }
  }

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return updates.filter((u) => {
      if (filter && String(u.status) !== filter) return false;
      if (!normalizedQuery) return true;
      const instituteName = String(u.institutes?.name ?? "").toLowerCase();
      const content = String(u.content ?? "").toLowerCase();
      return instituteName.includes(normalizedQuery) || content.includes(normalizedQuery);
    });
  }, [updates, filter, query]);

  return (
    <section className="space-y-5">
      <div className="vi-card border border-slate-200/80 bg-white/95 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Moderation Workspace</h2>
          <p className="text-sm text-slate-600">Review institute posts, apply filters, and take moderation actions from a single streamlined view.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <input
            className="vi-input"
            placeholder="Search by institute or content"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search updates"
          />
          <select className="vi-input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="vi-card border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No updates match your current search/filter.</div>
      ) : (
        <div className="space-y-4">
          {visible.map((u) => {
            const id = String(u.id ?? "");
            return (
              <article key={id} className="vi-card border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{String(u.institutes?.name ?? "Institute")}</p>
                    <p className="text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleString() : "Date unavailable"}</p>
                  </div>
                  <StatusBadge status={String(u.status ?? "pending_review")} />
                </header>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(u.content ?? "")}</p>

                {u.image_url ? <img src={String(u.image_url)} className="mt-4 h-44 w-full rounded-xl object-cover sm:h-56" alt="update" /> : null}
                {u.video_url ? <video src={String(u.video_url)} controls className="mt-4 h-52 w-full rounded-xl bg-black sm:h-72" /> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {ACTIONS.map((action) => {
                    const running = pendingAction === `${id}:${action.key}`;
                    return (
                      <button
                        key={action.key}
                        className={`inline-flex min-w-[88px] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 transition ${action.tone} disabled:cursor-not-allowed disabled:opacity-60`}
                        disabled={!!pendingAction}
                        onClick={() => act(id, action.key, !!action.needsReason, action.confirm)}
                      >
                        {running ? "Working..." : action.label}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
