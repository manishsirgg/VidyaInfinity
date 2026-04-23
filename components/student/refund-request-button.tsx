"use client";

import { useState } from "react";

export function RefundRequestButton({
  orderType,
  orderId,
  buttonLabel = "Request Refund",
  endpoint,
  requestBodyBuilder,
  disabled = false,
  onSuccess,
}: {
  orderType: "course" | "psychometric" | "webinar";
  orderId: string;
  buttonLabel?: string;
  endpoint?: string;
  requestBodyBuilder?: (input: { orderType: "course" | "psychometric" | "webinar"; orderId: string; reason: string }) => Record<string, unknown>;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function requestRefund() {
    if (submitting || requested || disabled) return;

    const reason = window.prompt(`Reason for ${orderType} refund request`, "Changed plan");
    if (!reason || !reason.trim()) return;

    setSubmitting(true);
    setMsg("");
    setIsError(false);

    try {
      const response = await fetch(endpoint ?? "/api/refunds/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBodyBuilder ? requestBodyBuilder({ orderType, orderId, reason: reason.trim() }) : { orderType, orderId, reason: reason.trim() }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setIsError(true);
        setMsg(body?.error ?? "Refund request failed.");
        return;
      }

      setRequested(true);
      setIsError(false);
      setMsg("Refund request submitted successfully.");
      onSuccess?.();
    } catch {
      setIsError(true);
      setMsg("Refund request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        className="rounded bg-amber-600 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
        onClick={requestRefund}
        disabled={disabled || submitting || requested}
      >
        {submitting ? "Submitting..." : requested ? "Refund Requested" : buttonLabel}
      </button>
      {msg ? <p className={`mt-1 text-xs ${isError ? "text-rose-700" : "text-emerald-700"}`}>{msg}</p> : null}
    </div>
  );
}
