import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

function maskMeeting(url: string | null) {
  if (!url) return "Not set";
  const start = url.slice(0, 20);
  return `${start}...`;
}

export default async function WebinarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) notFound();

  const [{ data: webinar }, { data: registrations }, { data: orders }, { data: payouts }] = await Promise.all([
    dataClient
      .from("webinars")
      .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_provider,meeting_url,status,approval_status,rejection_reason")
      .eq("id", id)
      .eq("institute_id", institute.id)
      .maybeSingle(),
    dataClient.from("webinar_registrations").select("id,payment_status,access_status").eq("webinar_id", id),
    dataClient.from("webinar_orders").select("id,payment_status,amount,platform_fee_amount,payout_amount").eq("webinar_id", id),
    dataClient.from("institute_payouts").select("id,payout_amount,payout_status").eq("webinar_id", id),
  ]);

  if (!webinar) notFound();

  const paidOrders = (orders ?? []).filter((order) => order.payment_status === "paid");
  const gross = paidOrders.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const platformFee = paidOrders.reduce((sum, row) => sum + Number(row.platform_fee_amount ?? 0), 0);
  const instituteShare = paidOrders.reduce((sum, row) => sum + Number(row.payout_amount ?? 0), 0);
  const payoutPending = (payouts ?? []).filter((item) => item.payout_status !== "paid").reduce((sum, row) => sum + Number(row.payout_amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{webinar.title}</h1>
          <p className="text-sm text-slate-600">{toDateTimeLabel(webinar.starts_at)} - {toDateTimeLabel(webinar.ends_at)}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={webinar.approval_status ?? "pending"} />
          <StatusBadge status={webinar.status} />
        </div>
      </div>

      {webinar.rejection_reason ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Rejection: {webinar.rejection_reason}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 text-sm">
          <p><span className="font-medium">Mode:</span> {webinar.webinar_mode}</p>
          <p><span className="font-medium">Price:</span> {webinar.webinar_mode === "paid" ? toCurrency(Number(webinar.price), webinar.currency) : "Free"}</p>
          <p><span className="font-medium">Meeting provider:</span> {webinar.meeting_provider ?? "google_meet"}</p>
          <p><span className="font-medium">Meeting URL:</span> {maskMeeting(webinar.meeting_url)}</p>
          <p className="mt-2 text-slate-600">{webinar.description ?? "No description provided."}</p>
        </section>
        <section className="rounded-xl border bg-white p-4 text-sm">
          <p><span className="font-medium">Registrations:</span> {(registrations ?? []).length}</p>
          <p><span className="font-medium">Paid orders:</span> {paidOrders.length}</p>
          <p><span className="font-medium">Gross:</span> {toCurrency(gross, webinar.currency)}</p>
          <p><span className="font-medium">Platform fee:</span> {toCurrency(platformFee, webinar.currency)}</p>
          <p><span className="font-medium">Institute share:</span> {toCurrency(instituteShare, webinar.currency)}</p>
          <p><span className="font-medium">Pending payout:</span> {toCurrency(payoutPending, webinar.currency)}</p>
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/institute/webinars/${id}/edit`} className="rounded border px-3 py-1.5">Edit webinar</Link>
        <Link href={`/institute/webinars/${id}/attendees`} className="rounded border px-3 py-1.5">View attendees</Link>
        <Link href={`/institute/webinars/${id}/orders`} className="rounded border px-3 py-1.5">View orders</Link>
        {webinar.meeting_url ? <a href={webinar.meeting_url} target="_blank" rel="noreferrer" className="rounded border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-800">Start / Open webinar</a> : null}
      </div>
    </div>
  );
}
