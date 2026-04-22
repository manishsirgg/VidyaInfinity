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
  activeAccessEndAt?: string | null;
  enrollmentOpen: boolean;
  statusLabel: string;
  canJoin: boolean;
  joinUrl: string | null;
  isStudent: boolean;
  initiallySaved?: boolean;
};

export function WebinarActionCard({
  webinarId,
  webinarTitle,
  webinarMode,
  price,
  isLoggedIn,
  enrollmentStatus,
  activeAccessEndAt,
  enrollmentOpen,
  statusLabel,
  canJoin,
  joinUrl,
  isStudent,
  initiallySaved = false,
}: WebinarActionCardProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [savedBusy, setSavedBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(initiallySaved);

  async function registerFree() {
    setLoading(true);
    setMessage("");
    setIsError(false);
    const response = await fetch(`/api/webinars/${webinarId}/register`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Unable to enroll in webinar");
      return;
    }
    setIsError(false);
    setMessage("Enrollment successful.");
    window.location.reload();
  }

  async function payNow() {
    setLoading(true);
    setMessage("");
    setIsError(false);
    const normalizedCouponCode = couponCode.trim().toUpperCase();
    const requestBody: { webinarId: string; couponCode?: string } = { webinarId };
    if (normalizedCouponCode) {
      requestBody.couponCode = normalizedCouponCode;
    }

    const createRes = await fetch("/api/payments/webinar/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const createBody = await createRes.json().catch(() => null);

    if (!createRes.ok || !createBody?.order?.id) {
      setLoading(false);
      setIsError(true);
      setMessage(createBody?.error ?? "Unable to create order");
      return;
    }

    if (!window.Razorpay) {
      setLoading(false);
      setIsError(true);
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
        await verifyRes.json().catch(() => null);
        setLoading(false);
        if (!verifyRes.ok) {
          window.location.href = `/student/payments/pending?kind=webinar&order_id=${encodeURIComponent(response.razorpay_order_id)}&payment_id=${encodeURIComponent(response.razorpay_payment_id)}&reason=${encodeURIComponent("verification_pending")}`;
          return;
        }
        window.location.href = `/student/payments/success?kind=webinar&order_id=${encodeURIComponent(response.razorpay_order_id)}&payment_id=${encodeURIComponent(response.razorpay_payment_id)}`;
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
          window.location.href = `/student/payments/pending?kind=webinar&order_id=${encodeURIComponent(order.id)}&reason=${encodeURIComponent("payment_modal_closed")}`;
        },
      },
    });

    razorpay.open();
  }

  async function toggleSaved() {
    setSavedBusy(true);
    setMessage("");
    setIsError(false);

    const response = await fetch("/api/student/saved-courses", {
      method: isSaved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webinarId }),
    });
    const body = await response.json().catch(() => null);
    setSavedBusy(false);

    if (!response.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Unable to update saved webinars.");
      return;
    }

    setIsSaved((prev) => !prev);
    setMessage(isSaved ? "Removed from saved list." : "Webinar saved.");
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
      {isEnrolled && !canJoin ? <p className="mt-2 text-sm text-emerald-700">Already Registered{activeAccessEndAt ? ` · Access Active Until ${new Date(activeAccessEndAt).toLocaleString()}` : ""}</p> : null}

      {webinarMode === "free" ? (
        <button type="button" disabled={ctaDisabled} onClick={registerFree} className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Processing..." : isEnrolled ? "Enrolled" : "Enroll Free"}
        </button>
      ) : (
        <>
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
          <button type="button" disabled={ctaDisabled} onClick={payNow} className="mt-3 w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {loading ? "Processing..." : isEnrolled ? "Enrolled" : `Pay ₹${price} & Enroll`}
          </button>
        </>
      )}

      {!enrollmentOpen ? <p className="mt-2 text-xs text-slate-600">Enrollment is closed for this webinar.</p> : null}
      {isLoggedIn && isStudent ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleSaved}
            disabled={savedBusy}
            className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {savedBusy ? "Updating..." : isSaved ? "Unsave Webinar" : "Save Webinar"}
          </button>
        </div>
      ) : null}
      {message ? <p className={`mt-2 text-xs ${isError ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
    </div>
  );
}
