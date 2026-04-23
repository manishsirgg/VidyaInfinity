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
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function requestRefund() {
    const reason = window.prompt(`Reason for ${orderType} refund request`, "Changed plan");
    if (!reason) return;
    setSubmitting(true);

    try {
      const response = await fetch(endpoint ?? "/api/refunds/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBodyBuilder ? requestBodyBuilder({ orderType, orderId, reason }) : { orderType, orderId, reason }),
      });

      const body = await response.json();
      const ok = Boolean(response.ok);
      setMsg(ok ? "Refund requested" : body.error ?? "Failed");
      if (ok) {
        setRequested(true);
        onSuccess?.();
      }
    } catch {
      setMsg("Failed");
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
        {buttonLabel}
      </button>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
