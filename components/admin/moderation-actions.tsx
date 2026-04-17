"use client";

import { useState } from "react";

type Props = {
  targetType: "institutes" | "courses";
  targetId: string;
  currentStatus: string;
};

export function ModerationActions({ targetType, targetId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function moderate(nextStatus: "approved" | "rejected") {
    setLoading(true);
    setError("");
    const rejectionReason =
      nextStatus === "rejected"
        ? window.prompt("Enter rejection reason", "Insufficient compliance documentation")
        : undefined;

    if (nextStatus === "rejected" && !rejectionReason) {
      setLoading(false);
      return;
    }

    const response = await fetch(`/api/admin/${targetType}/${targetId}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, rejectionReason }),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Failed to update status");
      return;
    }

    setStatus(nextStatus);
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs rounded bg-slate-100 px-2 py-1">{status}</span>
      <button
        disabled={loading}
        onClick={() => moderate("approved")}
        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
      >
        Approve
      </button>
      <button
        disabled={loading}
        onClick={() => moderate("rejected")}
        className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
      >
        Reject
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
