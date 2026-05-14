"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CourseArchiveActions({ courseId, title, isArchived }: { courseId: string; title: string; isArchived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function runAction() {
    const archiveAction = !isArchived;
    if (archiveAction && !window.confirm(`Archive "${title}"? This will hide it from students and disable new purchases.`)) return;
    setBusy(true);
    setMessage(null);

    const response = await fetch(`/api/institute/courses/${courseId}`, {
      method: archiveAction ? "DELETE" : "PATCH",
      headers: archiveAction ? undefined : { "Content-Type": "application/json" },
      body: archiveAction ? undefined : JSON.stringify({ action: "restore" }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body?.error ?? `Unable to ${archiveAction ? "archive" : "unarchive"} course.` });
      return;
    }
    setMessage({ type: "ok", text: body?.message ?? (archiveAction ? "Course archived successfully." : "Course unarchived successfully.") });
    router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={runAction} className={`rounded border px-3 py-1.5 disabled:opacity-60 ${isArchived ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-rose-300 text-rose-700 hover:bg-rose-50"}`}>
        {busy ? (isArchived ? "Unarchiving..." : "Archiving...") : isArchived ? "Unarchive" : "Archive"}
      </button>
      {message ? <p className={`mt-2 text-xs ${message.type === "error" ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</p> : null}
    </div>
  );
}
