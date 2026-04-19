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
  tierRank: number;
};

type FeaturedOrder = {
  id: string;
  amount: number;
  base_amount: number | null;
  credit_adjustment_amount: number | null;
  final_payable_amount: number | null;
  currency: string;
  payment_status: string;
  order_status: string;
  created_at: string;
  paid_at: string | null;
  duration_days: number;
  is_upgrade: boolean | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  auto_renew_requested: boolean | null;
};

type FeaturedSubscription = {
  id: string;
  plan_id: string | null;
  plan_code: string;
  amount: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  activated_at: string | null;
  upgraded_from_subscription_id: string | null;
  upgraded_to_subscription_id: string | null;
  auto_renew: boolean | null;
  end_behavior: string | null;
  upgrade_credit_used: number | null;
  auto_renewed_from_subscription_id: string | null;
};

type FeaturedSummary = {
  current: FeaturedSubscription | null;
  nextScheduled: FeaturedSubscription | null;
  hasActive: boolean;
  hasScheduled: boolean;
  nextPurchaseWillStack: boolean;
  upgradeAvailable: boolean;
};

type UpgradePreview = {
  plan: {
    id: string;
    baseAmount: number;
    creditAdjustmentAmount: number;
    finalPayableAmount: number;
    currency: string;
    durationDays: number;
  };
  purchaseMode: {
    isUpgrade: boolean;
    queuedOrder: boolean;
    currentTierRank: number;
    selectedTierRank: number;
  };
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

function dateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
  const [autoRenewRequested, setAutoRenewRequested] = useState(false);
  const [previewByPlanId, setPreviewByPlanId] = useState<Record<string, UpgradePreview>>({});

  const isBusy = Boolean(busyPlanId);

  const activePlan = useMemo(() => {
    if (!summary?.current?.plan_id) return null;
    return plans.find((plan) => plan.id === summary.current?.plan_id) ?? null;
  }, [plans, summary]);

  const activePlanLabel = useMemo(() => {
    if (!summary?.current) return "No active featured plan";
    const name = activePlan?.name ?? summary.current.plan_code;
    return `${name} · ${inr(Number(summary.current.amount ?? 0), summary.current.currency ?? "INR")}`;
  }, [activePlan, summary]);

  const subscriptionBuckets = useMemo(() => {
    const active = subscriptions.filter((item) => item.status === "active");
    const scheduled = subscriptions.filter((item) => item.status === "scheduled");
    const expired = subscriptions.filter((item) => item.status === "expired");
    return { active, scheduled, expired };
  }, [subscriptions]);

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

  async function loadPreview(plan: FeaturedPlan) {
    const response = await fetch("/api/institute/featured-subscriptions/create-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: plan.id, autoRenewRequested, previewOnly: true }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.plan) return null;

    const preview = {
      plan: body.plan,
      purchaseMode: body.purchaseMode,
    } as UpgradePreview;

    setPreviewByPlanId((current) => ({ ...current, [plan.id]: preview }));
    return preview;
  }

  async function activatePlan(plan: FeaturedPlan) {
    if (isBusy) return;

    setBusyPlanId(plan.id);
    setMessage(null);

    try {
      const createResponse = await fetch("/api/institute/featured-subscriptions/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id, autoRenewRequested }),
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
            verifyBody?.isUpgrade
              ? "Upgrade successful. New featured plan is active immediately."
              : verifyBody?.status === "scheduled"
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

  function getPlanState(plan: FeaturedPlan) {
    const currentPlan = activePlan;
    if (!summary?.current || !currentPlan) {
      return { disabled: false, badge: null as string | null, isUpgrade: false, willQueue: false };
    }

    if (plan.id === currentPlan.id) {
      return { disabled: true, badge: "Current Plan", isUpgrade: false, willQueue: true };
    }

    if (plan.tierRank < currentPlan.tierRank) {
      return { disabled: true, badge: "Lower Tier", isUpgrade: false, willQueue: true };
    }

    if (plan.tierRank === currentPlan.tierRank) {
      return { disabled: false, badge: "Scheduled", isUpgrade: false, willQueue: true };
    }

    return { disabled: false, badge: "Upgrade", isUpgrade: true, willQueue: false };
  }

  const renewalMode = summary?.current?.end_behavior === "auto_renew" ? "Auto renew enabled" : "Stops after expiry";

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
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Current Plan</p>
              <p className="mt-1 font-medium">{activePlanLabel}</p>
              {summary.upgradeAvailable ? <p className="mt-2 inline-flex rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">Upgrade available</p> : null}
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Expiry date</p>
              <p className="mt-1 font-medium">{when(summary.current?.ends_at)}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Auto Renew</p>
              <p className="mt-1 font-medium">{summary.current?.auto_renew ? "ON" : "OFF"}</p>
              <p className="text-xs text-slate-500">{renewalMode}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs uppercase text-slate-500">Queued plan</p>
              <p className="mt-1 font-medium">
                {summary.nextScheduled ? `${summary.nextScheduled.plan_code} (${dateOnly(summary.nextScheduled.starts_at)})` : "No scheduled plan"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No featured summary available yet.</p>
        )}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Choose a plan</h2>
          <label className="inline-flex items-center gap-2 rounded border bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={autoRenewRequested} onChange={(event) => setAutoRenewRequested(event.target.checked)} />
            <span>Auto renew this plan</span>
          </label>
        </div>

        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => {
            const state = getPlanState(plan);
            const preview = previewByPlanId[plan.id];
            return (
              <article key={plan.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase text-slate-500">{plan.name}</p>
                  {state.badge ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-700">{state.badge}</span> : null}
                </div>
                <p className="mt-1 text-2xl font-semibold">{inr(plan.price, plan.currency)}</p>
                <p className="mt-1 text-xs text-slate-600">{plan.durationDays} days</p>
                <p className="mt-2 text-xs text-slate-600">{plan.description ?? "Featured discovery boost for your institute."}</p>

                {state.willQueue && summary?.current ? (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">This plan will begin after your current subscription ends.</p>
                ) : null}

                {state.isUpgrade ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void loadPreview(plan)}
                    className="mt-3 w-full rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 disabled:opacity-70"
                  >
                    Check upgrade credit
                  </button>
                ) : null}

                {preview?.purchaseMode.isUpgrade ? (
                  <div className="mt-2 rounded border border-brand-100 bg-brand-50 p-2 text-xs text-brand-800">
                    <p>Original plan amount: {inr(preview.plan.baseAmount, preview.plan.currency)}</p>
                    <p>Remaining credit: {inr(preview.plan.creditAdjustmentAmount, preview.plan.currency)}</p>
                    <p>Final payable amount: {inr(preview.plan.finalPayableAmount, preview.plan.currency)}</p>
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={isBusy || state.disabled}
                  onClick={() => void activatePlan(plan)}
                  className="mt-4 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyPlanId === plan.id ? "Processing..." : state.isUpgrade ? "Upgrade Now" : state.badge === "Current Plan" ? "Current Plan" : "Activate plan"}
                </button>
              </article>
            );
          })}
          {!loading && plans.length === 0 ? (
            <p className="rounded border bg-white p-4 text-sm text-slate-600 md:col-span-2 xl:col-span-5">
              No active featured plans are available right now. Please contact support.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Subscription history</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {(["active", "scheduled", "expired"] as const).map((bucket) => {
            const items = subscriptionBuckets[bucket];
            return (
              <div key={bucket} className="rounded border p-3">
                <p className="text-sm font-semibold capitalize">{bucket}</p>
                <div className="mt-2 space-y-2 text-sm">
                  {items.map((item) => (
                    <div key={item.id} className="rounded border px-2 py-2">
                      <p className="font-medium">{item.plan_code} · {inr(Number(item.amount ?? 0), item.currency ?? "INR")}</p>
                      <p className="text-xs text-slate-600">{when(item.starts_at)} - {when(item.ends_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase">
                        {item.upgraded_from_subscription_id ? <span className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-700">Upgrade</span> : null}
                        {item.queued_from_previous ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Scheduled</span> : null}
                        {item.auto_renew ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Auto Renew</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Renewal behavior: {item.end_behavior ?? "-"}</p>
                      {item.upgrade_credit_used ? <p className="text-xs text-slate-500">Upgrade credits used: {inr(Number(item.upgrade_credit_used), item.currency ?? "INR")}</p> : null}
                      {item.upgraded_to_subscription_id ? <p className="text-xs text-slate-500">Replaced by subscription: {item.upgraded_to_subscription_id}</p> : null}
                      {item.auto_renewed_from_subscription_id ? <p className="text-xs text-slate-500">Auto-renewed from: {item.auto_renewed_from_subscription_id}</p> : null}
                    </div>
                  ))}
                  {!loading && items.length === 0 ? <p className="text-xs text-slate-500">No records.</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Order history</h2>
        <div className="mt-3 space-y-2 text-sm">
          {orders.map((order) => (
            <div key={order.id} className="rounded border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{inr(Number(order.base_amount ?? order.amount ?? 0), order.currency ?? "INR")} · {order.duration_days} days</p>
                {order.is_upgrade ? <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] uppercase text-brand-700">Upgrade</span> : null}
                {order.order_status === "scheduled" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">Scheduled</span> : null}
                {order.auto_renew_requested ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700">Auto Renew</span> : null}
              </div>
              <p className="text-slate-600">Original: {inr(Number(order.base_amount ?? order.amount ?? 0), order.currency ?? "INR")} · Credit: {inr(Number(order.credit_adjustment_amount ?? 0), order.currency ?? "INR")} · Final: {inr(Number(order.final_payable_amount ?? order.amount ?? 0), order.currency ?? "INR")}</p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Razorpay order: {order.razorpay_order_id ?? "-"} · Payment: {order.razorpay_payment_id ?? "-"}</p>
              <p className="text-xs text-slate-500">Created {when(order.created_at)}{order.paid_at ? ` · Paid ${when(order.paid_at)}` : ""}</p>
            </div>
          ))}
          {!loading && orders.length === 0 ? <p className="text-slate-500">No featured orders yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
