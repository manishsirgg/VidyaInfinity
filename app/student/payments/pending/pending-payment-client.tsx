"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PollState = "pending" | "paid" | "failed" | "enrolled";

type StatusResponse = {
  ok?: boolean;
  state?: PollState;
  redirectTo?: string;
  error?: string;
  order?: {
    courseTitle?: string | null;
  };
};

const POLL_INTERVAL_MS = 4000;
const MAX_PENDING_DURATION_MS = 5 * 60 * 1000;

export function PendingPaymentClient({
  orderId,
  razorpayOrderId,
  paymentId,
  initialReason,
}: {
  orderId: string;
  razorpayOrderId: string;
  paymentId: string;
  initialReason: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "waiting" | "timeout" | "error">("checking");
  const [message, setMessage] = useState(initialReason ? `Current status: ${initialReason.replaceAll("_", " ")}.` : "");
  const [lastResolvedState, setLastResolvedState] = useState<PollState | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const pollingRef = useRef<number | null>(null);

  const statusUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (orderId) params.set("order_id", orderId);
    if (razorpayOrderId) params.set("razorpay_order_id", razorpayOrderId);
    if (paymentId) params.set("payment_id", paymentId);
    return `/api/payments/course/status?${params.toString()}`;
  }, [orderId, razorpayOrderId, paymentId]);

  const hasAnyIdentifier = Boolean(orderId || razorpayOrderId || paymentId);

  const clearPollTimer = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleResolved = useCallback(
    (nextState: PollState, redirectTo?: string) => {
      setLastResolvedState(nextState);
      if (nextState === "paid" || nextState === "enrolled") {
        router.replace(redirectTo || `/student/payments/success?order_id=${encodeURIComponent(orderId)}`);
        return;
      }
      if (nextState === "failed") {
        router.replace(redirectTo || `/student/payments/failed?order_id=${encodeURIComponent(orderId)}`);
      }
    },
    [orderId, router]
  );

  const pollOnce = useCallback(async () => {
    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed > MAX_PENDING_DURATION_MS) {
      setStatus("timeout");
      setMessage("This is taking longer than expected. UPI/QR confirmations can be delayed. You can retry status check.");
      clearPollTimer();
      return;
    }

    if (!hasAnyIdentifier) {
      setStatus("error");
      setMessage("Missing order/payment reference. Please retry checkout from the course page.");
      clearPollTimer();
      return;
    }

    try {
      const response = await fetch(statusUrl, { method: "GET", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as StatusResponse | null;

      if (!response.ok || !body?.ok) {
        if (response.status === 400 || response.status === 404) {
          setStatus("error");
          setMessage(body?.error ?? "Order reference was not found. Please retry checkout.");
          clearPollTimer();
          return;
        }

        setStatus("waiting");
        setMessage("Unable to confirm status right now. Retrying automatically…");
      } else if (body.state === "pending") {
        setStatus("waiting");
        setMessage("Checking payment status… please keep this page open for UPI/QR settlement confirmation.");
      } else if (body.state === "paid" || body.state === "enrolled" || body.state === "failed") {
        handleResolved(body.state, body.redirectTo);
        return;
      } else {
        setStatus("waiting");
        setMessage("Payment confirmation is still in progress. Retrying automatically…");
      }
    } catch {
      setStatus("waiting");
      setMessage("Network issue while checking payment status. Retrying automatically…");
    }

    clearPollTimer();
    pollingRef.current = window.setTimeout(() => {
      pollOnce().catch(() => undefined);
    }, POLL_INTERVAL_MS);
  }, [clearPollTimer, handleResolved, hasAnyIdentifier, statusUrl]);

  useEffect(() => {
    pollOnce().catch(() => undefined);

    return () => {
      clearPollTimer();
    };
  }, [clearPollTimer, pollOnce]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Checking payment status…</h1>
        <p className="mt-2 text-sm text-slate-600">
          We are confirming your Razorpay payment. Card payments usually resolve quickly, while UPI and QR can take longer.
        </p>

        {message ? <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-700">{message}</p> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              startedAtRef.current = Date.now();
              setStatus("checking");
              pollOnce().catch(() => undefined);
            }}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Retry status check
          </button>
          <Link href="/student/purchases" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">
            Go to purchases
          </Link>
          <Link href="/contact" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">
            Contact support
          </Link>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Order: {razorpayOrderId || orderId || "-"} · Payment: {paymentId || "-"} · Status: {lastResolvedState ?? status}
        </p>
      </div>
    </div>
  );
}
