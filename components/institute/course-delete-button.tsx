"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CourseDeleteButton({ courseId, title }: { courseId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onArchive() {
    if (!window.confirm(`Archive \"${title}\"? This will hide it from students and disable new purchases.`)) return;
    setBusy(true);
    setError("");

    const response = await fetch(`/api/institute/courses/${courseId}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Unable to archive course.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={onArchive}
        className="rounded border border-rose-300 px-3 py-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        {busy ? "Archiving..." : "Archive"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
