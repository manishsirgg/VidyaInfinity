"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function CoursePurchaseCard({
  courseId,
  courseTitle,
  feeAmount,
}: {
  courseId: string;
  courseTitle: string;
  feeAmount: number;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function enrollNow() {
    setState("loading");
    setMessage("");

    try {
      const createOrderResponse = await fetch("/api/payments/course/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });

      const createOrderBody = await createOrderResponse.json().catch(() => null);
      if (!createOrderResponse.ok || !createOrderBody?.order?.id) {
        setState("error");
        setMessage(createOrderBody?.error ?? "Unable to start payment");
        return;
      }

      if (!window.Razorpay) {
        setState("error");
        setMessage("Payment SDK failed to load. Refresh and try again.");
        return;
      }

      const order = createOrderBody.order as { id: string; amount: number; currency: string };

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "Vidya Infinity",
        description: `Enrollment: ${courseTitle}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyResponse = await fetch("/api/payments/course/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });

          const verifyBody = await verifyResponse.json().catch(() => null);

          if (!verifyResponse.ok) {
            setState("error");
            setMessage(verifyBody?.error ?? "Payment verification failed");
            return;
          }

          setState("success");
          setMessage("Payment verified and enrollment confirmed. You can now review your enrollment in the dashboard.");
        },
        modal: {
          ondismiss: () => {
            if (state !== "success") {
              setState("idle");
              setMessage("Payment cancelled.");
            }
          },
        },
      });

      razorpay.open();
    } catch {
      setState("error");
      setMessage("Unable to process payment right now. Please try again.");
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <p className="text-sm text-slate-600">Course fee</p>
      <p className="text-2xl font-semibold">₹{feeAmount}</p>
      <button
        type="button"
        onClick={enrollNow}
        disabled={state === "loading"}
        className="mt-3 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {state === "loading" ? "Processing..." : "Pay & Enroll"}
      </button>
      {message ? <p className={`mt-2 text-xs ${state === "error" ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
    </div>
  );
}
