"use client";

import { useState } from "react";

export function SavedCourseActions({ courseId, webinarId, itemType = "course" }: { courseId?: string; webinarId?: string; itemType?: "course" | "webinar" }) {
  const [busy, setBusy] = useState<"none" | "save">("none");
  const [message, setMessage] = useState("");

  async function removeSaved() {
    setBusy("save");
    setMessage("");

    const response = await fetch("/api/student/saved-courses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemType === "webinar" ? { webinarId } : { courseId }),
    });

    const body = await response.json().catch(() => null);
    setBusy("none");

    if (!response.ok) {
      setMessage(body?.error ?? `Unable to remove saved ${itemType}.`);
      return;
    }

    setMessage(`Removed from saved ${itemType === "course" ? "list" : "webinars"}. Refresh to update the list.`);
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={removeSaved}
        disabled={busy !== "none"}
        className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
      >
        {busy === "save" ? "Removing..." : "Remove"}
      </button>
      {message ? <p className="w-full text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
