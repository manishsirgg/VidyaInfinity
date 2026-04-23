"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  amount: number;
  currency: string;
  tierRank: number;
};

type Course = {
  id: string;
  title: string;
  category: string | null;
  level: string | null;
  status: string;
  is_active: boolean | null;
};

type Subscription = {
  id: string;
  course_id: string;
  course_title: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  amount: number;
  currency: string;
};

type Order = {
  id: string;
  course_id: string;
  course_title: string;
  plan_id: string | null;
  plan_name: string | null;
  amount: number;
  currency: string;
  duration_days: number;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
};

type Summary = {
  activeCount: number;
  scheduledCount: number;
  expiringSoonCount: number;
};

function inr(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function when(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function getSubscriptionDisplayStatus(subscription: Subscription) {
  const nowMs = Date.now();
  const startMs = new Date(subscription.starts_at).getTime();
  const endMs = new Date(subscription.ends_at).getTime();
  if (subscription.status === "active" && startMs <= nowMs && endMs > nowMs) return "active";
  if (subscription.status === "scheduled" && startMs > nowMs) return "scheduled";
  if (endMs <= nowMs) return "expired";
  return subscription.status;
}

export function InstituteCourseFeaturedPageClient() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary>({ activeCount: 0, scheduledCount: 0, expiringSoonCount: 0 });
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [selectedPlanByCourse, setSelectedPlanByCourse] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/institute/course-featured", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessageType("error");
      setMessage(body?.error ?? "Unable to load course featured data.");
      setLoading(false);
      return;
    }

    setPlans((body?.plans ?? []) as Plan[]);
    setCourses((body?.courses ?? []) as Course[]);
    setSubscriptions((body?.subscriptions ?? []) as Subscription[]);
    setOrders((body?.orders ?? []) as Order[]);
    setSummary((body?.summary ?? { activeCount: 0, scheduledCount: 0, expiringSoonCount: 0 }) as Summary);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (plans.length === 0 || courses.length === 0) return;
    const validPlanIds = new Set(plans.map((plan) => plan.id));
    setSelectedPlanByCourse((current) => {
      const next = { ...current };
      for (const course of courses) {
        const currentPlanId = next[course.id];
        if (!currentPlanId || !validPlanIds.has(currentPlanId)) next[course.id] = plans[0].id;
      }
      return next;
    });
  }, [plans, courses]);

  const subscriptionByCourse = useMemo(() => {
    const nowMs = Date.now();
    const grouped = new Map<string, { active: Subscription | null; scheduled: Subscription | null }>();

    for (const subscription of subscriptions) {
      const current = grouped.get(subscription.course_id) ?? { active: null, scheduled: null };
      const startMs = new Date(subscription.starts_at).getTime();
      const endMs = new Date(subscription.ends_at).getTime();
      if (subscription.status === "active" && startMs <= nowMs && endMs > nowMs) {
        if (!current.active || new Date(current.active.ends_at).getTime() < endMs) current.active = subscription;
      }
      if (subscription.status === "scheduled" && startMs > nowMs) {
        if (!current.scheduled || new Date(current.scheduled.starts_at).getTime() > startMs) current.scheduled = subscription;
      }
      grouped.set(subscription.course_id, current);
    }

    return grouped;
  }, [subscriptions]);

  async function purchase(courseId: string) {
    const planId = selectedPlanByCourse[courseId];
    if (!planId || busyCourseId) return;

    setBusyCourseId(courseId);
    setMessage(null);

    try {
      const createResponse = await fetch("/api/institute/course-featured/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, planId }),
      });

      const createBody = await createResponse.json().catch(() => null);
      if (!createResponse.ok || !createBody?.order?.id) {
        setMessageType("error");
        setMessage(createBody?.error ?? `Unable to start payment via /api/institute/course-featured/create-order (status ${createResponse.status}).`);
        setBusyCourseId(null);
        return;
      }

      if (!window.Razorpay) {
        setMessageType("error");
        setMessage("Razorpay checkout failed to load. Please refresh and try again.");
        setBusyCourseId(null);
        return;
      }

      const order = createBody.order as { id: string; amount: number; currency: string };
      const selectedPlan = plans.find((plan) => plan.id === planId);

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "Vidya Infinity",
        description: `Feature course · ${selectedPlan?.name ?? "Plan"}`,
        handler: async (response: RazorpaySuccessResponse) => {
          const verifyResponse = await fetch("/api/institute/course-featured/verify", {
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
            setMessageType("error");
            setMessage(verifyBody?.error ?? "Payment verification failed.");
            setBusyCourseId(null);
            return;
          }

          setMessageType("success");
          setMessage(verifyBody?.status === "scheduled" ? "Payment successful. Course extension is scheduled." : "Payment successful. Course is now featured.");
          await loadData();
          setBusyCourseId(null);
        },
        modal: {
          ondismiss: () => {
            setMessageType("info");
            setMessage("Payment checkout was closed before completion.");
            setBusyCourseId(null);
          },
        },
      });

      razorpay.open();
    } catch {
      setMessageType("error");
      setMessage("Unable to process payment right now. Please try again.");
      setBusyCourseId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <h1 className="text-2xl font-semibold">Course Featured Listing</h1>
      <p className="mt-2 text-sm text-slate-600">Feature individual approved courses to boost visibility in public discovery sections.</p>

      {message ? (
        <p className={`mt-4 rounded border px-3 py-2 text-sm ${messageType === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          {message}
        </p>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded border bg-white p-4"><p className="text-xs uppercase text-slate-500">Currently Featured</p><p className="mt-1 text-2xl font-semibold">{summary.activeCount}</p></div>
        <div className="rounded border bg-white p-4"><p className="text-xs uppercase text-slate-500">Scheduled Next</p><p className="mt-1 text-2xl font-semibold">{summary.scheduledCount}</p></div>
        <div className="rounded border bg-white p-4"><p className="text-xs uppercase text-slate-500">Expiring in 7 days</p><p className="mt-1 text-2xl font-semibold">{summary.expiringSoonCount}</p></div>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Eligible Courses</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading courses...</p> : null}
        {!loading && courses.length === 0 ? <p className="mt-3 text-sm text-slate-500">No approved active courses are eligible right now.</p> : null}
        <div className="mt-4 space-y-3">
          {courses.map((course) => {
            const state = subscriptionByCourse.get(course.id) ?? { active: null, scheduled: null };
            const selectedPlanId = selectedPlanByCourse[course.id] ?? "";
            const activePlan = plans.find((plan) => plan.code === state.active?.plan_code);
            const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
            const isUpgrade = Boolean(state.active && selectedPlan && activePlan && selectedPlan.tierRank > activePlan.tierRank);
            const actionText = isUpgrade ? "Upgrade Feature" : state.active ? "Extend Feature" : "Feature Course";

            return (
              <div key={course.id} className="rounded border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-medium">{course.title}</p>
                    <p className="text-xs text-slate-500">{course.category ?? "General"} · {course.level ?? "-"} · {course.status}</p>
                    {state.active ? (
                      <p className="mt-2 text-xs text-emerald-700">Currently Featured · Expires On {when(state.active.ends_at)}</p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Not currently featured</p>
                    )}
                    {state.scheduled ? (
                      <p className="mt-1 text-xs text-amber-700">Scheduled Next Feature · Starts On {when(state.scheduled.starts_at)} · Expires On {when(state.scheduled.ends_at)}</p>
                    ) : null}
                  </div>

                  <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[320px]">
                    <select
                      className="rounded border px-3 py-2 text-sm"
                      value={selectedPlanId}
                      onChange={(event) => setSelectedPlanByCourse((current) => ({ ...current, [course.id]: event.target.value }))}
                      disabled={Boolean(busyCourseId)}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name} · {plan.durationDays} days · {inr(plan.amount, plan.currency)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      onClick={() => void purchase(course.id)}
                      disabled={Boolean(busyCourseId) || plans.length === 0 || (state.active !== null && state.scheduled !== null && !isUpgrade)}
                    >
                      {busyCourseId === course.id ? "Processing..." : actionText}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Subscription History</h2>
        <div className="mt-3 space-y-2 text-sm">
          {subscriptions.map((item) => (
            <div key={item.id} className="rounded border p-3">
              <p className="font-medium">{item.course_title} · {item.plan_name ?? item.plan_code ?? "Plan"}</p>
              <p className="text-slate-600">Status: {getSubscriptionDisplayStatus(item)} · Starts: {when(item.starts_at)} · Ends: {when(item.ends_at)}</p>
              <p className="text-xs text-slate-500">Queued from previous: {item.queued_from_previous ? "Yes" : "No"} · Amount: {inr(item.amount, item.currency)}</p>
            </div>
          ))}
          {!loading && subscriptions.length === 0 ? <p className="text-slate-500">No course featured subscriptions yet.</p> : null}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Order History</h2>
        <div className="mt-3 space-y-2 text-sm">
          {orders.map((order) => (
            <div key={order.id} className="rounded border p-3">
              <p className="font-medium">{order.course_title} · {order.plan_name ?? "Plan"} · {inr(order.amount, order.currency)}</p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Paid at: {when(order.paid_at)} · Created: {when(order.created_at)}</p>
            </div>
          ))}
          {!loading && orders.length === 0 ? <p className="text-slate-500">No course featured orders yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
