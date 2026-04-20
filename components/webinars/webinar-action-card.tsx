"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type WebinarActionCardProps = {
  webinarId: string;
  webinarTitle: string;
  webinarMode: "free" | "paid";
  price: number;
  isLoggedIn: boolean;
  enrollmentStatus: "none" | "enrolled";
  enrollmentOpen: boolean;
  statusLabel: string;
  canJoin: boolean;
  joinUrl: string | null;
};

export function WebinarActionCard({
  webinarId,
  webinarTitle,
  webinarMode,
  price,
  isLoggedIn,
  enrollmentStatus,
  enrollmentOpen,
  statusLabel,
  canJoin,
  joinUrl,
}: WebinarActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function registerFree() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/webinars/${webinarId}/register`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setMessage(body?.error ?? "Unable to enroll in webinar");
      return;
    }
    setMessage("Enrollment successful.");
    window.location.reload();
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
          setMessage(verifyBody?.error ?? "Payment verification failed");
          return;
        }
        setMessage("Payment successful. Enrollment confirmed.");
        window.location.reload();
      },
    });

    razorpay.open();
  }

  if (canJoin && joinUrl) {
    return <a href={joinUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Join Webinar</a>;
  }

  const isEnrolled = enrollmentStatus === "enrolled";
  const ctaDisabled = loading || !isLoggedIn || !enrollmentOpen || isEnrolled;

  return (
    <div className="rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <p className="text-sm font-medium text-slate-800">Status: {statusLabel}</p>

      {!isLoggedIn ? <p className="mt-2 text-sm text-slate-600">Please login as a student to enroll.</p> : null}
      {isEnrolled && !canJoin ? <p className="mt-2 text-sm text-emerald-700">Enrolled</p> : null}

      {webinarMode === "free" ? (
        <button type="button" disabled={ctaDisabled} onClick={registerFree} className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Processing..." : isEnrolled ? "Enrolled" : "Enroll Free"}
        </button>
      ) : (
        <button type="button" disabled={ctaDisabled} onClick={payNow} className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Processing..." : isEnrolled ? "Enrolled" : `Pay ₹${price} & Enroll`}
        </button>
      )}

      {!enrollmentOpen ? <p className="mt-2 text-xs text-slate-600">Enrollment is closed for this webinar.</p> : null}
      {message ? <p className="mt-2 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
