"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  requestId: string;
};

export function SyllabusModerationActions({ requestId }: Props) {
  const router = useRouter();
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function moderate(action: "approve" | "reject") {
    if (isSubmitting) return;
    const reason = rejectionReason.trim();

    if (action === "reject" && !reason) {
      setError("Rejection reason is required to reject a syllabus request.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/course-syllabus-requests/${requestId}/moderate`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { action: "approve" }
            : { action: "reject", rejectionReason: reason },
        ),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? payload?.message ?? "Failed to moderate syllabus request.");
      }

      setRejectionReason("");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to process request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void moderate("approve")}
          className="rounded bg-emerald-600 px-2 py-1 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Approve Syllabus
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void moderate("reject")}
          className="rounded bg-amber-600 px-2 py-1 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject Syllabus
        </button>
      </div>
      <input
        value={rejectionReason}
        onChange={(event) => setRejectionReason(event.target.value)}
        placeholder="Rejection reason"
        className="rounded border px-2 py-1"
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
