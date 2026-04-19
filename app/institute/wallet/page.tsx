import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN");
}

export default async function InstituteWalletPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute, error: instituteError } = await dataClient
    .from("institutes")
    .select("id,name")
    .eq("user_id", user.id)
    .maybeSingle();

  const [ordersResult, payoutsResult] = institute
    ? await Promise.all([
        dataClient
          .from("course_orders")
          .select("id,gross_amount,platform_fee_amount,institute_receivable_amount,payment_status,created_at,paid_at")
          .eq("institute_id", institute.id)
          .order("created_at", { ascending: false }),
        dataClient
          .from("institute_payouts")
          .select("id,amount_payable,payout_status,created_at,paid_at")
          .eq("institute_id", institute.id)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const paidOrders = (ordersResult.data ?? []).filter((item) => item.payment_status === "paid");
  const payouts = payoutsResult.data ?? [];

  const grossRevenue = paidOrders.reduce((sum, item) => sum + Number(item.gross_amount ?? 0), 0);
  const totalCommission = paidOrders.reduce((sum, item) => sum + Number(item.platform_fee_amount ?? 0), 0);
  const netEarnings = paidOrders.reduce((sum, item) => sum + Number(item.institute_receivable_amount ?? 0), 0);
  const paidOut = payouts.filter((item) => item.payout_status === "paid").reduce((sum, item) => sum + Number(item.amount_payable ?? 0), 0);
  const pendingPayouts = payouts
    .filter((item) => item.payout_status === "pending" || item.payout_status === "processing")
    .reduce((sum, item) => sum + Number(item.amount_payable ?? 0), 0);
  const walletBalance = Math.max(netEarnings - paidOut, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Institute Wallet Balance</h1>
          <p className="mt-2 text-sm text-slate-600">Track revenue, commissions, payouts, and available wallet balance.</p>
        </div>
        <Link href="/institute/dashboard" className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Wallet balance</p>
          <p className="mt-1 text-2xl font-semibold">{money(walletBalance)}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Gross revenue</p>
          <p className="mt-1 text-2xl font-semibold">{money(grossRevenue)}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Platform fee</p>
          <p className="mt-1 text-2xl font-semibold">{money(totalCommission)}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Net earnings</p>
          <p className="mt-1 text-2xl font-semibold">{money(netEarnings)}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending payouts</p>
          <p className="mt-1 text-2xl font-semibold">{money(pendingPayouts)}</p>
        </div>
      </div>

      {instituteError ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load institute record: {instituteError.message}</p> : null}
      {ordersResult.error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load order transactions: {ordersResult.error.message}</p> : null}
      {payoutsResult.error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load payout history: {payoutsResult.error.message}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Recent paid orders</h2>
          <div className="mt-3 space-y-2 text-sm">
            {paidOrders.slice(0, 10).map((order) => (
              <div key={order.id} className="rounded border px-3 py-2">
                <p className="font-medium">{money(Number(order.institute_receivable_amount ?? 0))} receivable</p>
                <p className="text-slate-600">
                  Gross {money(Number(order.gross_amount ?? 0))} · Fee {money(Number(order.platform_fee_amount ?? 0))}
                </p>
                <p className="text-xs text-slate-500">Paid at: {formatDate(order.paid_at)} · Created: {formatDate(order.created_at)}</p>
              </div>
            ))}
            {paidOrders.length === 0 ? <p className="text-slate-600">No paid orders yet.</p> : null}
          </div>
        </section>

        <section className="rounded border bg-white p-4">
          <h2 className="text-base font-semibold">Payout history</h2>
          <div className="mt-3 space-y-2 text-sm">
            {payouts.slice(0, 10).map((payout) => (
              <div key={payout.id} className="rounded border px-3 py-2">
                <p className="font-medium">{money(Number(payout.amount_payable ?? 0))}</p>
                <p className="text-slate-600">Status: {payout.payout_status}</p>
                <p className="text-xs text-slate-500">Paid at: {formatDate(payout.paid_at)} · Requested: {formatDate(payout.created_at)}</p>
              </div>
            ))}
            {payouts.length === 0 ? <p className="text-slate-600">No payouts yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
