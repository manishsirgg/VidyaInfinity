"use client";

import { useState } from "react";

export function RefundRequestButton({ orderType, orderId }: { orderType: "course" | "psychometric"; orderId: string }) {
  const [msg, setMsg] = useState("");

  async function requestRefund() {
    const reason = window.prompt("Reason for refund request", "Changed plan");
    if (!reason) return;

    const response = await fetch("/api/refunds/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderType, orderId, reason }),
    });

    const body = await response.json();
    setMsg(response.ok ? "Refund requested" : body.error ?? "Failed");
  }

  return (
    <div className="mt-1">
      <button className="rounded bg-amber-600 px-2 py-1 text-xs text-white" onClick={requestRefund}>
        Request Refund
      </button>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
