"use client";

import { useEffect, useState } from "react";

import { featuredInstitutePlans } from "@/lib/institute/featured-plans";

type Subscription = {
  id: string;
  plan_code: string;
  amount: number;
  starts_at: string;
  ends_at: string;
  status: string;
  lead_boost_note: string | null;
};

export default function InstituteFeaturedPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/institute/featured-subscriptions", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setSubscriptions(body.subscriptions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function activatePlan(planCode: string) {
    setBusyPlan(planCode);
    const response = await fetch("/api/institute/featured-subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode }),
    });
    if (response.ok) await loadData();
    setBusyPlan(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Featured Listing Subscription</h1>
      <p className="mt-2 text-sm text-slate-600">Get more visibility and qualified leads by featuring your institute and courses across discovery pages.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {featuredInstitutePlans.map((plan) => (
          <article key={plan.code} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{plan.label}</p>
            <p className="mt-1 text-2xl font-semibold">₹{plan.amount}</p>
            <p className="mt-2 text-xs text-slate-600">{plan.description}</p>
            <button
              type="button"
              disabled={busyPlan === plan.code}
              onClick={() => activatePlan(plan.code)}
              className="mt-4 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-70"
            >
              {busyPlan === plan.code ? "Activating..." : "Activate plan"}
            </button>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Subscription history</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading subscriptions...</p> : null}
        <div className="mt-3 space-y-2 text-sm">
          {subscriptions.map((item) => (
            <div key={item.id} className="rounded border px-3 py-2">
              <p className="font-medium">{item.plan_code} · ₹{item.amount}</p>
              <p className="text-slate-600">{new Date(item.starts_at).toLocaleDateString()} - {new Date(item.ends_at).toLocaleDateString()} · {item.status}</p>
              {item.lead_boost_note ? <p className="text-xs text-brand-700">{item.lead_boost_note}</p> : null}
            </div>
          ))}
          {!loading && subscriptions.length === 0 ? <p className="text-slate-500">No featured subscription yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
