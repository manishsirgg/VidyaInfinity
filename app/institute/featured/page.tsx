"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type FeaturedPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  price: number;
  currency: string;
};

type FeaturedOrder = {
  id: string;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  created_at: string;
  paid_at: string | null;
  duration_days: number;
};

type FeaturedSubscription = {
  id: string;
  plan_code: string;
  amount: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  activated_at: string | null;
};

type FeaturedSummary = {
  current: FeaturedSubscription | null;
  nextScheduled: FeaturedSubscription | null;
  hasActive: boolean;
  hasScheduled: boolean;
  nextPurchaseWillStack: boolean;
};

function inr(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function when(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InstituteFeaturedPage() {
  const [plans, setPlans] = useState<FeaturedPlan[]>([]);
  const [orders, setOrders] = useState<FeaturedOrder[]>([]);
  const [subscriptions, setSubscriptions] = useState<FeaturedSubscription[]>([]);
  const [summary, setSummary] = useState<FeaturedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");

  const isBusy = Boolean(busyPlanId);

  const activePlanLabel = useMemo(() => {
    if (!summary?.current) return "No active featured plan";
    return `${summary.current.plan_code} · ${inr(Number(summary.current.amount ?? 0), summary.current.currency ?? "INR")}`;
  }, [summary]);

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/institute/featured-subscriptions", { cache: "no-store" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(body?.error ?? "Unable to load featured subscription data.");
      setMessageType("error");
      setLoading(false);
      return;
    }

    setPlans((body?.plans ?? []) as FeaturedPlan[]);
    setOrders((body?.orders ?? []) as FeaturedOrder[]);
    setSubscriptions((body?.subscriptions ?? []) as FeaturedSubscription[]);
    setSummary((body?.summary ?? null) as FeaturedSummary | null);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function activatePlan(plan: FeaturedPlan) {
    if (isBusy) return;

    setBusyPlanId(plan.id);
    setMessage(null);

    try {
      const createResponse = await fetch("/api/institute/featured-subscriptions/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });

      const createBody = await createResponse.json().catch(() => null);
      if (!createResponse.ok || !createBody?.order?.id) {
        setMessage(createBody?.error ?? "Unable to initiate payment for selected plan.");
        setMessageType("error");
        setBusyPlanId(null);
        return;
      }

      if (!window.Razorpay) {
        setMessage("Razorpay checkout failed to load. Refresh and try again.");
        setMessageType("error");
        setBusyPlanId(null);
        return;
      }

      const order = createBody.order as { id: string; amount: number; currency: string };

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "Vidya Infinity",
        description: `Featured Listing Plan: ${plan.name}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyResponse = await fetch("/api/institute/featured-subscriptions/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });

          const verifyBody = await verifyResponse.json().catch(() => null);
          if (!verifyResponse.ok) {
            setMessage(verifyBody?.error ?? "Payment verification failed.");
            setMessageType("error");
            setBusyPlanId(null);
            return;
          }

          setMessageType("success");
          setMessage(
            verifyBody?.status === "scheduled"
              ? "Payment successful. Plan purchased and scheduled to start after your current plan."
              : "Payment successful. Featured listing is active now."
          );
          await loadData();
          setBusyPlanId(null);
        },
        modal: {
          ondismiss: () => {
            setBusyPlanId(null);
            setMessageType("info");
            setMessage("Payment checkout was closed before completion.");
          },
        },
      });

      razorpay.open();
    } catch {
      setBusyPlanId(null);
      setMessageType("error");
      setMessage("Unable to process featured payment right now. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <h1 className="text-2xl font-semibold">Featured Listing Subscription</h1>
      <p className="mt-2 text-sm text-slate-600">
        Buy featured visibility plans to prioritize your institute across discovery surfaces and improve lead flow.
      </p>

      {message ? (
        <p className={`mt-4 rounded border px-3 py-2 text-sm ${messageType === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          {message}
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Current featured status</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading featured summary...</p>
        ) : summary ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Currently Active</p>
              <p className="mt-1 font-medium">{activePlanLabel}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Expires On</p>
              <p className="mt-1 font-medium">{when(summary.current?.ends_at)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Scheduled Next</p>
              <p className="mt-1 font-medium">
                {summary.nextScheduled
                  ? `${summary.nextScheduled.plan_code} (${when(summary.nextScheduled.starts_at)})`
                  : "No scheduled plan"}
              </p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Stacking</p>
              <p className="mt-1 font-medium">{summary.nextPurchaseWillStack ? "Yes, next purchase will queue" : "No, starts immediately"}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No featured summary available yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Choose a plan</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase text-slate-500">{plan.name}</p>
              <p className="mt-1 text-2xl font-semibold">{inr(plan.price, plan.currency)}</p>
              <p className="mt-1 text-xs text-slate-600">{plan.durationDays} days</p>
              <p className="mt-2 text-xs text-slate-600">{plan.description ?? "Featured discovery boost for your institute."}</p>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => activatePlan(plan)}
                className="mt-4 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-70"
              >
                {busyPlanId === plan.id ? "Processing..." : "Activate plan"}
              </button>
            </article>
          ))}
          {!loading && plans.length === 0 ? (
            <p className="rounded border bg-white p-4 text-sm text-slate-600 md:col-span-2 xl:col-span-5">
              No active featured plans are available right now. Please contact support.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Subscription history</h2>
        <div className="mt-3 space-y-2 text-sm">
          {subscriptions.map((item) => (
            <div key={item.id} className="rounded border px-3 py-2">
              <p className="font-medium">{item.plan_code} · {inr(Number(item.amount ?? 0), item.currency ?? "INR")}</p>
              <p className="text-slate-600">{when(item.starts_at)} - {when(item.ends_at)} · {item.status}</p>
              {item.queued_from_previous ? <p className="text-xs text-brand-700">Queued from previous active subscription window.</p> : null}
            </div>
          ))}
          {!loading && subscriptions.length === 0 ? <p className="text-slate-500">No featured subscription yet.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Order history</h2>
        <div className="mt-3 space-y-2 text-sm">
          {orders.map((order) => (
            <div key={order.id} className="rounded border px-3 py-2">
              <p className="font-medium">{inr(Number(order.amount ?? 0), order.currency ?? "INR")} · {order.duration_days} days</p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Created {when(order.created_at)}{order.paid_at ? ` · Paid ${when(order.paid_at)}` : ""}</p>
            </div>
          ))}
          {!loading && orders.length === 0 ? <p className="text-slate-500">No featured orders yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
