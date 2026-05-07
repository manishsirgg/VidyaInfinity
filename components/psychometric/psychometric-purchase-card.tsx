"use client";

import Script from "next/script";
import { useMemo, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function PsychometricPurchaseCard({
  testId,
  testTitle,
  price,
  purchaseLocked,
  role,
  entitlement,
}: {
  testId: string;
  testTitle: string;
  price: number;
  purchaseLocked?: boolean;
  role?: string | null;
  entitlement?: { attemptId: string | null; reportId: string | null; redirectTo: string } | null;
}) {
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [alreadyPurchasedInfo, setAlreadyPurchasedInfo] = useState<{ attemptId: string | null; reportId: string | null; redirectTo: string } | null>(entitlement ?? null);
  const [pricing, setPricing] = useState<{ baseAmount: number; discountPercent: number; discountAmount: number; finalAmount: number } | null>(null);

  const viewPricing = useMemo(() => pricing ?? { baseAmount: price, discountPercent: 0, discountAmount: 0, finalAmount: price }, [price, pricing]);

  async function applyCoupon() {
    setCouponLoading(true);
    setMessage("");
    setIsError(false);
    const normalizedCouponCode = couponCode.trim().toUpperCase();
    if (!normalizedCouponCode) {
      setCouponLoading(false);
      setIsError(true);
      setMessage("Enter a coupon code first.");
      return;
    }

    const res = await fetch("/api/psychometric/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId, couponCode: normalizedCouponCode, validateOnly: true }),
    });
    const body = await res.json().catch(() => null);
    setCouponLoading(false);

    if (!res.ok || !body?.pricing) {
      setIsError(true);
      setMessage(body?.error ?? "Unable to validate coupon.");
      return;
    }

    setAppliedCoupon(normalizedCouponCode);
    setPricing(body.pricing);
    setCouponCode(normalizedCouponCode);
    setIsError(false);
    setMessage(`Coupon ${normalizedCouponCode} applied successfully.`);
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setPricing(null);
    setIsError(false);
    setMessage("Coupon removed.");
  }

  async function payNow() {
    setLoading(true);
    setMessage("");
    setIsError(false);

    const requestBody: { testId: string; couponCode?: string } = { testId };
    if (appliedCoupon) requestBody.couponCode = appliedCoupon;

    const createRes = await fetch("/api/psychometric/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const createBody = await createRes.json().catch(() => null);

    if (createBody?.alreadyPurchased) {
      setLoading(false);
      setAlreadyPurchasedInfo({
        attemptId: createBody?.attemptId ?? null,
        reportId: createBody?.reportId ?? null,
        redirectTo: createBody?.redirectTo ?? "/student/purchases?kind=psychometric",
      });
      setIsError(false);
      setMessage("You have already purchased this test. Continue from your purchases.");
      return;
    }

    if (!createRes.ok || !createBody?.order?.id || !createBody?.localOrderId || !createBody?.key) {
      setLoading(false);
      setIsError(true);
      if (createRes.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      setMessage(createBody?.error ?? "Unable to start payment.");
      return;
    }

    if (!window.Razorpay) {
      setLoading(false);
      setIsError(true);
      setMessage("Payment SDK failed to load. Refresh and try again.");
      return;
    }

    const order = createBody.order as { id: string; amount: number; currency: string };

    const razorpay = new window.Razorpay({
      key: createBody.key,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "Vidya Infinity",
      description: `Psychometric Test: ${testTitle}`,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyRes = await fetch("/api/psychometric/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            local_order_id: createBody.localOrderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        });
        const verifyBody = await verifyRes.json().catch(() => null);

        setLoading(false);
        if (!verifyRes.ok) {
          window.location.href = `/student/payments/pending?kind=psychometric&order_id=${encodeURIComponent(response.razorpay_order_id)}&payment_id=${encodeURIComponent(response.razorpay_payment_id)}&reason=${encodeURIComponent("verification_pending")}`;
          return;
        }
        window.location.href = typeof verifyBody?.redirectTo === "string" ? verifyBody.redirectTo : "/dashboard/psychometric";
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
          window.location.href = `/student/payments/pending?kind=psychometric&order_id=${encodeURIComponent(order.id)}&reason=${encodeURIComponent("payment_modal_closed")}`;
        },
      },
    });

    razorpay.open();
  }

  return (
    <div className="mt-6 rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <p className="text-sm text-slate-600">Base price</p>
      <p className="text-xl font-semibold">₹{viewPricing.baseAmount.toFixed(2)}</p>
      <p className="mt-1 text-sm text-emerald-700">Discount: ₹{viewPricing.discountAmount.toFixed(2)}</p>
      <p className="text-lg font-semibold">Payable: ₹{viewPricing.finalAmount.toFixed(2)}</p>
      <div className="mt-3">
        <label className="text-xs text-slate-600">Coupon code (optional)</label>
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          placeholder="Enter coupon code"
          autoComplete="off"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          disabled={loading || couponLoading}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={applyCoupon} disabled={loading || couponLoading} className="rounded border px-3 py-1 text-xs disabled:opacity-60">
          {couponLoading ? "Applying..." : "Apply coupon"}
        </button>
        <button type="button" onClick={removeCoupon} disabled={loading || couponLoading || !appliedCoupon} className="rounded border px-3 py-1 text-xs disabled:opacity-60">
          Remove coupon
        </button>
      </div>
      <button
        type="button"
        onClick={payNow}
        disabled={loading || couponLoading || Boolean(purchaseLocked) || Boolean(alreadyPurchasedInfo) || Boolean(role && role !== "student")}
        className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Processing..." : purchaseLocked ? "Already Purchased" : role === "admin" ? "Student purchase required" : role && role !== "student" ? "Available for student accounts only" : "Pay & Unlock Test"}
      </button>
      {alreadyPurchasedInfo ? (
        <a href={alreadyPurchasedInfo.redirectTo} className="mt-3 block w-full rounded border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-800">
          {alreadyPurchasedInfo.reportId ? "View Report" : alreadyPurchasedInfo.attemptId ? "Continue Test" : "Go to Purchases"}
        </a>
      ) : null}
      {message ? <p className={`mt-2 text-xs ${isError ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
    </div>
  );
}
