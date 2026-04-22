"use client";

import { useState } from "react";

const ACTIONS = [
  { key: "processing", label: "Approve" },
  { key: "cancelled", label: "Reject" },
  { key: "refunded", label: "Mark Processed" },
  { key: "failed", label: "Mark Failed" },
] as const;

export function RefundStatusActions({ refundId, currentStatus }: { refundId: string; currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [msg, setMsg] = useState("");

  async function update(nextStatus: string) {
    const response = await fetch(`/api/admin/refunds/${refundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, adminNote: `Updated to ${nextStatus}` }),
    });

    const body = await response.json();
    if (!response.ok) {
      setMsg(body.error ?? "Failed");
      return;
    }

    setStatus(nextStatus);
    setMsg("Updated");
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="rounded bg-slate-100 px-2 py-1 text-xs">{status}</span>
      {ACTIONS.map((item) => (
        <button key={item.key} className="rounded bg-brand-600 px-2 py-1 text-xs text-white" onClick={() => update(item.key)}>
          {item.label}
        </button>
      ))}
      {msg && <span className="text-xs text-slate-700">{msg}</span>}
    </div>
  );
}
