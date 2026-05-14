"use client";

import { FormEvent, useMemo, useState } from "react";

type Kind = "all" | "course" | "webinar";

type ReconciliationBucket = {
  processed: number;
  converted: number;
  skipped: number;
  errors?: Array<{ orderId?: string; message?: string }>;
};

type ReconciliationResponse = {
  ok?: boolean;
  kind?: Kind;
  limit?: number;
  course?: ReconciliationBucket;
  webinar?: ReconciliationBucket;
  error?: string;
  details?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ReconcilePaidOrdersForm() {
  const [kind, setKind] = useState<Kind>("all");
  const [limit, setLimit] = useState("20");
  const [orderId, setOrderId] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReconciliationResponse | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const allErrors = useMemo(
    () => [...(result?.course?.errors ?? []), ...(result?.webinar?.errors ?? [])],
    [result?.course?.errors, result?.webinar?.errors]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setStatusCode(null);

    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setError("Limit must be an integer between 1 and 500.");
      return;
    }

    const trimmedOrderId = orderId.trim();
    if (trimmedOrderId && kind === "all") {
      setError("For a single order ID, choose Course or Webinar.");
      return;
    }

    if (trimmedOrderId && !UUID_REGEX.test(trimmedOrderId)) {
      setError("Order ID must be an internal UUID.");
      return;
    }

    const payload: { kind: Kind; limit: number; orderId?: string } = { kind, limit: parsedLimit };
    if (trimmedOrderId) payload.orderId = trimmedOrderId;

    setRunning(true);
    try {
      const res = await fetch("/api/admin/crm/reconcile-paid-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json: ReconciliationResponse | null = null;
      try {
        json = JSON.parse(text) as ReconciliationResponse;
      } catch {
        json = null;
      }

      setStatusCode(res.status);

      if (!res.ok) {
        setError(json?.error ?? json?.details ?? (text || "Reconciliation failed."));
        setResult(json);
        return;
      }

      setResult(json ?? { ok: true, kind, limit: parsedLimit });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Network error while reconciling.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="vi-card p-5">
      <h2 className="text-base font-semibold text-slate-900">Reconcile Paid Orders</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-800">Kind</span>
          <select className="vi-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={running}>
            <option value="all">all</option>
            <option value="course">course</option>
            <option value="webinar">webinar</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-800">Limit</span>
          <input
            className="vi-input"
            type="number"
            min={1}
            max={500}
            step={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={running}
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-slate-800">Optional internal order ID</span>
          <input
            className="vi-input"
            placeholder="Optional internal order UUID"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            disabled={running}
          />
          <span className="text-xs text-slate-600">Use only for reconciling one specific internal course_order/webinar_order UUID.</span>
        </label>

        <div className="flex gap-3 md:col-span-2">
          <button type="submit" className="vi-btn" disabled={running}>
            {running ? "Reconciling…" : "Run reconciliation"}
          </button>
          <button
            type="button"
            className="vi-btn-secondary"
            disabled={running}
            onClick={() => {
              setError("");
              setResult(null);
              setStatusCode(null);
            }}
          >
            Reset result
          </button>
        </div>
      </form>

      {error ? <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      {result ? (
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Result</h3>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">HTTP status: {statusCode ?? "—"}</div>
            <div className="rounded-md border border-slate-200 p-3">ok: {String(Boolean(result.ok))}</div>
            <div className="rounded-md border border-slate-200 p-3">kind: {result.kind ?? "—"}</div>
            <div className="rounded-md border border-slate-200 p-3">limit: {typeof result.limit === "number" ? result.limit : "—"}</div>
          </div>

          {result.course ? (
            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">Course summary</p>
              <p>processed: {result.course.processed}</p>
              <p>converted: {result.course.converted}</p>
              <p>skipped: {result.course.skipped}</p>
              <p>errors: {result.course.errors?.length ?? 0}</p>
            </div>
          ) : null}

          {result.webinar ? (
            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">Webinar summary</p>
              <p>processed: {result.webinar.processed}</p>
              <p>converted: {result.webinar.converted}</p>
              <p>skipped: {result.webinar.skipped}</p>
              <p>errors: {result.webinar.errors?.length ?? 0}</p>
            </div>
          ) : null}

          {allErrors.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Errors</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {allErrors.map((item, index) => (
                  <li key={`${item.orderId ?? "unknown"}-${index}`}>
                    {item.orderId ? `orderId: ${item.orderId} — ` : ""}
                    {item.message ?? "Unknown error"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="rounded-md border border-slate-200 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-slate-800">Raw JSON</summary>
            <pre className="mt-3 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
