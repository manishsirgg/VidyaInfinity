"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  targetType: "institutes" | "courses" | "users" | "webinars";
  targetId: string;
  currentStatus: string;
  isActionable?: boolean;
  disabledReason?: string;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
};

function defaultDisabledReason(status: string) {
  if (status === "approved") return "Already approved";
  if (status === "rejected") return "Waiting for resubmission";
  return "No active pending submission";
}

export function ModerationActions({ targetType, targetId, currentStatus, isActionable, disabledReason, approveDisabled, approveDisabledReason }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedByAction, setLockedByAction] = useState(false);

  const canModerate = isActionable ?? status === "pending";
  const buttonsDisabled = loading || lockedByAction || !canModerate;
  const approveButtonDisabled = buttonsDisabled || Boolean(approveDisabled);

  const effectiveDisabledReason = useMemo(() => {
    if (loading) return "";
    if (!buttonsDisabled && approveDisabled) return approveDisabledReason?.trim() || "Approval is currently unavailable.";
    if (!buttonsDisabled) return "";
    return disabledReason?.trim() || defaultDisabledReason(status);
  }, [approveDisabled, approveDisabledReason, buttonsDisabled, disabledReason, loading, status]);

  async function moderate(nextStatus: "approved" | "rejected") {
    if (nextStatus === "approved" && approveButtonDisabled) return;
    if (nextStatus === "rejected" && buttonsDisabled) return;

    setLoading(true);
    setLockedByAction(true);
    setError("");

    const rejectionReason =
      nextStatus === "rejected"
        ? window.prompt("Enter rejection reason", "Insufficient compliance documentation")?.trim()
        : undefined;

    if (nextStatus === "rejected" && !rejectionReason) {
      setLoading(false);
      setLockedByAction(false);
      setError("Rejection reason is required.");
      return;
    }

    const response = await fetch(`/api/admin/${targetType}/${targetId}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, rejectionReason }),
    });

    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setLockedByAction(false);
      setError((typeof body?.error === "string" && body.error) || "Failed to update status");
      return;
    }

    setStatus(nextStatus);
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs rounded bg-slate-100 px-2 py-1">{status}</span>
        <button
          disabled={approveButtonDisabled}
          onClick={() => moderate("approved")}
          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working..." : "Approve"}
        </button>
        <button
          disabled={buttonsDisabled}
          onClick={() => moderate("rejected")}
          className="rounded bg-rose-600 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working..." : "Reject"}
        </button>
      </div>

      {effectiveDisabledReason ? <p className="text-xs text-slate-500">{effectiveDisabledReason}</p> : null}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
