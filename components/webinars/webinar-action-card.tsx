"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function WebinarActionCard({ webinarId, webinarTitle, webinarMode, price, canJoin, meetingUrl, isLoggedIn }: { webinarId: string; webinarTitle: string; webinarMode: "free" | "paid"; price: number; canJoin: boolean; meetingUrl: string | null; isLoggedIn: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function registerFree() {
    setLoading(true);
    const response = await fetch(`/api/webinars/${webinarId}/register`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setMessage(body?.error ?? "Unable to register");
      return;
    }
    setMessage("Registration confirmed. Join link will unlock near start time.");
  }

  async function payNow() {
    setLoading(true);
    setMessage("");
    const createRes = await fetch("/api/payments/webinar/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webinarId }),
    });
    const createBody = await createRes.json().catch(() => null);

    if (!createRes.ok || !createBody?.order?.id) {
      setLoading(false);
      setMessage(createBody?.error ?? "Unable to create order");
      return;
    }

    if (!window.Razorpay) {
      setLoading(false);
      setMessage("Razorpay SDK not loaded");
      return;
    }

    const order = createBody.order as { id: string; amount: number; currency: string };

    const razorpay = new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "Vidya Infinity",
      description: `Webinar: ${webinarTitle}`,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyRes = await fetch("/api/payments/webinar/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
        });
        const verifyBody = await verifyRes.json().catch(() => null);
        setLoading(false);
        if (!verifyRes.ok) {
          setMessage(verifyBody?.error ?? "Verification failed");
          return;
        }
        setMessage("Payment successful. Access granted.");
        window.location.reload();
      },
    });

    razorpay.open();
  }

  if (canJoin && meetingUrl) {
    return <a href={meetingUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Join webinar</a>;
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      {!isLoggedIn ? <p className="text-sm text-slate-600">Please login as student to register.</p> : null}
      {webinarMode === "free" ? (
        <button type="button" disabled={loading || !isLoggedIn} onClick={registerFree} className="mt-2 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Processing..." : "Register free"}
        </button>
      ) : (
        <button type="button" disabled={loading || !isLoggedIn} onClick={payNow} className="mt-2 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Processing..." : `Pay ₹${price} & Register`}
        </button>
      )}
      {message ? <p className="mt-2 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
