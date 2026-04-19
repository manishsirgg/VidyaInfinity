import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

function profileField(value: unknown, key: "full_name" | "email") {
  if (Array.isArray(value)) return ((value[0] as { full_name?: string; email?: string } | undefined)?.[key] ?? null);
  return ((value as { full_name?: string; email?: string } | null)?.[key] ?? null);
}

export default async function WebinarOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) notFound();

  const { data: webinar } = await dataClient.from("webinars").select("id,title,currency").eq("id", id).eq("institute_id", institute.id).maybeSingle<{ id: string; title: string; currency: string }>();
  if (!webinar) notFound();

  const { data: orders } = await dataClient
    .from("webinar_orders")
    .select("id,amount,payment_status,order_status,access_status,paid_at,platform_fee_amount,payout_amount,profiles!webinar_orders_student_id_fkey(full_name,email)")
    .eq("webinar_id", id)
    .order("created_at", { ascending: false });

  const rows = orders ?? [];
  const gross = rows.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const fee = rows.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + Number(item.platform_fee_amount ?? 0), 0);
  const share = rows.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + Number(item.payout_amount ?? 0), 0);
  const paidCount = rows.filter((item) => item.payment_status === "paid").length;
  const refundedCount = rows.filter((item) => item.payment_status === "refunded").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Orders · {webinar.title}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Gross</p><p className="font-semibold">{toCurrency(gross, webinar.currency)}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Platform fee</p><p className="font-semibold">{toCurrency(fee, webinar.currency)}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Institute share</p><p className="font-semibold">{toCurrency(share, webinar.currency)}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Paid orders</p><p className="font-semibold">{paidCount}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Refunded orders</p><p className="font-semibold">{refundedCount}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">{profileField(row.profiles, "full_name") ?? profileField(row.profiles, "email") ?? "Student"}</p>
            <p className="text-slate-600">{toCurrency(Number(row.amount ?? 0), webinar.currency)} · Paid at {toDateTimeLabel(row.paid_at)}</p>
            <p className="text-xs text-slate-500">Fee {toCurrency(Number(row.platform_fee_amount ?? 0), webinar.currency)} · Payout {toCurrency(Number(row.payout_amount ?? 0), webinar.currency)}</p>
            <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={row.payment_status} /><StatusBadge status={row.order_status} /><StatusBadge status={row.access_status} /></div>
          </article>
        ))}
      </div>
    </div>
  );
}
