"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PollState = "pending" | "success" | "failed";

export function PaymentPendingStatus() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") ?? "";
  const razorpayOrderId = searchParams.get("razorpay_order_id") ?? "";

  const [status, setStatus] = useState<PollState>("pending");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (orderId) params.set("order_id", orderId);
    if (razorpayOrderId) params.set("razorpay_order_id", razorpayOrderId);
    return params.toString();
  }, [orderId, razorpayOrderId]);

  useEffect(() => {
    if (!query) {
      setError("Missing order reference. Please go back to payments and retry.");
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/payments/course/status?${query}`, { method: "GET", cache: "no-store" });
        const body = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok) {
          setAttempts((prev) => prev + 1);
          setError(body?.error ?? "Unable to check payment status right now.");
          return;
        }

        const nextState = (body?.state ?? "pending") as PollState;
        setStatus(nextState);

        if (nextState === "success" || nextState === "failed") {
          router.replace(body?.redirectUrl ?? `/student/payments/${nextState}`);
        } else {
          setAttempts((prev) => prev + 1);
        }
      } catch {
        if (!cancelled) {
          setAttempts((prev) => prev + 1);
          setError("Network issue while checking payment status. Retrying...");
        }
      }
    }

    poll().catch(() => undefined);
    const interval = setInterval(() => {
      poll().catch(() => undefined);
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [query, router]);

  return (
    <div className="rounded-xl border bg-white p-5 text-sm text-slate-700">
      <p className="font-medium text-slate-900">We are confirming your payment.</p>
      <p className="mt-2">Please keep this page open. UPI and QR confirmations can take a short while.</p>
      <p className="mt-2 text-xs text-slate-500">Checks completed: {attempts}</p>
      {orderId ? <p className="mt-2 text-xs text-slate-500">Order reference: {orderId}</p> : null}
      {razorpayOrderId ? <p className="mt-1 text-xs text-slate-500">Gateway order: {razorpayOrderId}</p> : null}
      {status === "pending" ? <p className="mt-3 text-amber-700">Status: Pending confirmation</p> : null}
      {error ? <p className="mt-3 text-rose-700">{error}</p> : null}
    </div>
  );
}
