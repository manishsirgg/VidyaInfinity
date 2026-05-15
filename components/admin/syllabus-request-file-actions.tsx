"use client";

import { useState } from "react";

export function SyllabusRequestFileActions({ requestId }: { requestId: string }) {
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");

  async function openFile(download: boolean) {
    setState("loading");
    setError("");
    try {
      const response = await fetch(`/api/admin/course-syllabus-requests/${requestId}/file-url`, { method: "GET" });
      const body = (await response.json().catch(() => null)) as { error?: string; url?: string; fileName?: string } | null;
      if (!response.ok || !body?.url) {
        setError(body?.error ?? "Unable to fetch proposed syllabus file URL.");
        return;
      }
      const target = download ? `${body.url}&download=${encodeURIComponent(body.fileName ?? "syllabus.pdf")}` : body.url;
      window.open(target, "_blank", "noopener,noreferrer");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openFile(false)} disabled={state === "loading"} className="rounded border px-2 py-1 text-xs">
          {state === "loading" ? "Loading..." : "View Proposed PDF"}
        </button>
        <button type="button" onClick={() => openFile(true)} disabled={state === "loading"} className="rounded border px-2 py-1 text-xs">
          Download Proposed PDF
        </button>
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
