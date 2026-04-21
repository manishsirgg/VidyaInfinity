"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function PsychometricPurchaseCard({ testId, testTitle, price }: { testId: string; testTitle: string; price: number }) {
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function payNow() {
    setLoading(true);
    setMessage("");
    setIsError(false);

    const normalizedCouponCode = couponCode.trim().toUpperCase();
    const requestBody: { testId: string; couponCode?: string } = { testId };
    if (normalizedCouponCode) {
      requestBody.couponCode = normalizedCouponCode;
    }

    const createRes = await fetch("/api/payments/test/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const createBody = await createRes.json().catch(() => null);

    if (!createRes.ok || !createBody?.order?.id) {
      setLoading(false);
      setIsError(true);
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
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "Vidya Infinity",
      description: `Psychometric Test: ${testTitle}`,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyRes = await fetch("/api/payments/test/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
        });
        const verifyBody = await verifyRes.json().catch(() => null);

        setLoading(false);
        if (!verifyRes.ok) {
          setIsError(true);
          setMessage(verifyBody?.error ?? "Payment verification failed.");
          return;
        }

        setIsError(false);
        setMessage("Payment successful. Test access is now unlocked.");
        window.location.reload();
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
          setIsError(false);
          setMessage("Payment cancelled.");
        },
      },
    });

    razorpay.open();
  }

  return (
    <div className="mt-6 rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <p className="text-sm text-slate-600">One-time price</p>
      <p className="text-xl font-semibold">₹{price}</p>
      <div className="mt-3">
        <label className="text-xs text-slate-600">Coupon code (optional)</label>
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          placeholder="Enter coupon code"
          autoComplete="off"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={payNow}
        disabled={loading}
        className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Processing..." : "Pay & Unlock Test"}
      </button>
      {message ? <p className={`mt-2 text-xs ${isError ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
    </div>
  );
}
