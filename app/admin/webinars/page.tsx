import Link from "next/link";

import { ModerationActions } from "@/components/admin/moderation-actions";
import { ModerationPagination } from "@/components/admin/moderation-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

function relationName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name ?? "-";
  }
  const row = value as { name?: string } | null;
  return row?.name ?? "-";
}

export default async function AdminWebinarsPage({ searchParams }: { searchParams: Promise<{ approval_status?: string }> }) {
  await requireUser("admin");
  const { approval_status, page } = (await searchParams) as { approval_status?: string; page?: string };
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = 10;
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);

  let query = admin.data
    .from("webinars")
    .select("id,title,starts_at,ends_at,webinar_mode,price,currency,status,approval_status,rejection_reason,created_at,institutes(name)", { count: "exact" })
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (approval_status && ["pending", "approved", "rejected"].includes(approval_status)) {
    query = query.eq("approval_status", approval_status);
  }

  const { data: webinars, count, error } = await query;
  if (error) throw new Error(`Unable to load webinars: ${error.message}`);
  const sortedWebinars = [...(webinars ?? [])].sort((a, b) => {
    const aPending = (a.approval_status ?? "pending") === "pending" ? 0 : 1;
    const bPending = (b.approval_status ?? "pending") === "pending" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    const aCreatedAt = Date.parse(a.created_at ?? "") || 0;
    const bCreatedAt = Date.parse(b.created_at ?? "") || 0;
    return bCreatedAt - aCreatedAt;
  });
  const totalItems = count ?? sortedWebinars.length;
  const paginatedWebinars = sortedWebinars.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const paidCount = paginatedWebinars.filter((item) => item.webinar_mode === "paid").length;
  const freeCount = paginatedWebinars.length - paidCount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin Webinar Moderation</h1>
      <p className="mt-1 text-sm text-slate-600">Server-side paginated moderation view with status filters for reliable large-volume review.</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/webinars" className="rounded border px-3 py-1.5">All</Link>
        <Link href="/admin/webinars?approval_status=pending" className="rounded border px-3 py-1.5">Pending</Link>
        <Link href="/admin/webinars?approval_status=approved" className="rounded border px-3 py-1.5">Approved</Link>
        <Link href="/admin/webinars?approval_status=rejected" className="rounded border px-3 py-1.5">Rejected</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-3 text-sm">
          <p className="text-xs uppercase text-slate-500">Total matching webinars</p>
          <p className="mt-1 text-xl font-semibold">{totalItems}</p>
        </div>
        <div className="rounded border bg-white p-3 text-sm">
          <p className="text-xs uppercase text-slate-500">Paid on this page</p>
          <p className="mt-1 text-xl font-semibold">{paidCount}</p>
        </div>
        <div className="rounded border bg-white p-3 text-sm">
          <p className="text-xs uppercase text-slate-500">Free on this page</p>
          <p className="mt-1 text-xl font-semibold">{freeCount}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {paginatedWebinars.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-slate-600">Institute: {relationName(item.institutes)}</p>
                <p className="text-slate-600">{toDateTimeLabel(item.starts_at)} · {item.webinar_mode === "paid" ? toCurrency(Number(item.price), item.currency) : "Free"}</p>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={item.approval_status ?? "pending"} />
                <StatusBadge status={item.status} />
              </div>
            </div>
            {item.rejection_reason ? <p className="mt-2 text-xs text-rose-700">Rejection reason: {item.rejection_reason}</p> : null}
            <ModerationActions targetType="webinars" targetId={item.id} currentStatus={item.approval_status ?? "pending"} />
          </article>
        ))}
      </div>
      <ModerationPagination
        page={pageNumber}
        pageSize={pageSize}
        totalItems={totalItems}
        pathname="/admin/webinars"
        query={{ approval_status }}
      />
    </div>
  );
}
