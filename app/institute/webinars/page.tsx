import Link from "next/link";

import { isWebinarPromotable } from "@/lib/webinar-featured";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

export default async function InstituteWebinarsPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) return <div className="mx-auto max-w-6xl px-4 py-10">Institute profile not found.</div>;

  const [{ data: webinars }, { data: registrations }, { data: orders }, { data: webinarFeaturedSummary }] = await Promise.all([
    dataClient
      .from("webinars")
      .select("id,title,starts_at,ends_at,webinar_mode,price,currency,approval_status,status")
      .eq("institute_id", institute.id)
      .order("starts_at", { ascending: true }),
    dataClient.from("webinar_registrations").select("id,webinar_id").eq("institute_id", institute.id),
    dataClient.from("webinar_orders").select("id,webinar_id,payment_status,amount,platform_fee_amount,payout_amount").eq("institute_id", institute.id),
    dataClient.from("webinar_featured_subscription_summary").select("webinar_id,status,starts_at,ends_at").eq("institute_id", institute.id),
  ]);

  const webinarRows = webinars ?? [];
  const regRows = registrations ?? [];
  const orderRows = orders ?? [];
  const paidOrders = orderRows.filter((item) => item.payment_status === "paid");
  const webinarFeaturedRows = (webinarFeaturedSummary as Array<{ webinar_id: string; status: string; starts_at: string; ends_at: string }> | null) ?? [];
  const attendeeCountMap = new Map<string, number>();
  for (const row of regRows) attendeeCountMap.set(row.webinar_id, (attendeeCountMap.get(row.webinar_id) ?? 0) + 1);

  const stats = {
    total: webinarRows.length,
    approved: webinarRows.filter((item) => item.approval_status === "approved").length,
    pending: webinarRows.filter((item) => item.approval_status === "pending").length,
    rejected: webinarRows.filter((item) => item.approval_status === "rejected").length,
    upcoming: webinarRows.filter((item) => new Date(item.starts_at).getTime() >= Date.now() && item.status !== "cancelled").length,
    registrations: regRows.length,
    revenue: paidOrders.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    eligibleForPromotion: webinarRows.filter(isWebinarPromotable).length,
    activeFeatured: webinarFeaturedRows.filter((item) => item.status === "active" && new Date(item.starts_at).getTime() <= Date.now() && new Date(item.ends_at).getTime() > Date.now()).length,
    scheduledFeatured: webinarFeaturedRows.filter((item) => item.status === "scheduled" && new Date(item.starts_at).getTime() > Date.now()).length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Institute Webinars</h1>
          <p className="text-sm text-slate-600">Manage webinar schedule, registrations, and paid orders.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/institute/webinars/featured" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800">Promote webinars</Link>
          <Link href="/institute/webinars/new" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800">Schedule webinar</Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Total webinars</p><p className="text-xl font-semibold">{stats.total}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Approved / Pending / Rejected</p><p className="text-xl font-semibold">{stats.approved} / {stats.pending} / {stats.rejected}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Upcoming & registrations</p><p className="text-xl font-semibold">{stats.upcoming} · {stats.registrations}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Paid revenue</p><p className="text-xl font-semibold">{toCurrency(stats.revenue)}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-xs text-slate-500">Featured promotion</p><p className="text-xl font-semibold">{stats.activeFeatured} active · {stats.scheduledFeatured} queued</p></div>
      </div>

      <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Eligible for webinar promotion: {stats.eligibleForPromotion}</div>

      <div className="mt-6 space-y-3">
        {webinarRows.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-slate-600">{toDateTimeLabel(item.starts_at)} · {item.webinar_mode === "paid" ? toCurrency(Number(item.price), item.currency ?? "INR") : "Free"}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.approval_status ?? "pending"} />
                <StatusBadge status={item.status} />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">Attendees: {attendeeCountMap.get(item.id) ?? 0}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link className="rounded border px-3 py-1.5" href={`/institute/webinars/${item.id}`}>View</Link>
              <Link className="rounded border px-3 py-1.5" href={`/institute/webinars/${item.id}/edit`}>Edit</Link>
              <Link className="rounded border px-3 py-1.5" href={`/institute/webinars/${item.id}/attendees`}>Attendees</Link>
              <Link className="rounded border px-3 py-1.5" href={`/institute/webinars/${item.id}/orders`}>Orders</Link>
              <Link className="rounded border px-3 py-1.5" href="/institute/webinars/featured">Promote</Link>
            </div>
          </article>
        ))}
        {webinarRows.length === 0 ? <div className="rounded border border-dashed bg-white p-8 text-center text-slate-600">No webinars scheduled yet.</div> : null}
      </div>
    </div>
  );
}
