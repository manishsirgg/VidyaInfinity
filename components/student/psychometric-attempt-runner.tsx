"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; option_text: string };
type Q = {
  id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  min_scale_value: number | null;
  max_scale_value: number | null;
  help_text?: string | null;
  options: Option[];
};

export function PsychometricAttemptRunner({ attemptId, attemptStatus, testTitle, questions, initial }: { attemptId: string; attemptStatus: string; testTitle: string; questions: Q[]; initial: Record<string, unknown> }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [autosaveError, setAutosaveError] = useState("");
  const router = useRouter();

  const isAnswered = (q: Q) => {
    const v = answers[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(String(v ?? "").trim());
  };

  const answered = useMemo(() => questions.filter((q) => {
    const v = answers[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(String(v ?? "").trim());
  }).length, [answers, questions]);
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty || saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);

  const save = async (q: Q, v: unknown) => {
    setSaving(true);
    setDirty(true);
    setAnswers((p) => ({ ...p, [q.id]: v }));
    const body: Record<string, unknown> = { questionId: q.id };
    if (q.question_type === "single_choice") body.optionId = v;
    if (q.question_type === "multiple_choice") body.selectedValues = v;
    if (q.question_type === "scale" || q.question_type === "numeric") body.numericValue = Number(v);
    if (q.question_type === "text") body.answerText = String(v ?? "");
    console.log("[psychometric-autosave-request]", {
      attemptId,
      questionId: q.id,
      questionType: q.question_type,
      payload: body,
    });

    try {
      const r = await fetch(`/api/psychometric/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      setSaving(false);
      if (r.ok) {
        setDirty(false);
        setAutosaveError("");
        setMsg("All changes saved");
      } else {
        const backendError = typeof b?.error === "string" && b.error.trim() ? b.error.trim() : "Answer could not be saved. Please try again.";
        setAutosaveError(backendError);
        setMsg(backendError);
      }
    } catch {
      setSaving(false);
      setAutosaveError("Answer could not be saved. Please try again.");
      setMsg("Save failed");
    }
  };

  const submit = async () => {
    const missingNow = questions.filter((q) => q.is_required && !isAnswered(q)).map((q) => q.id);
    setMissing(missingNow);
    if (missingNow.length) {
      setMsg(`Please answer ${missingNow.length} required question(s).`);
      return;
    }
    setSubmitting(true);
    const r = await fetch(`/api/psychometric/attempts/${attemptId}/submit`, { method: "POST" });
    const b = await r.json();
    setSubmitting(false);
    if (!r.ok) {
      setMsg(b.error ?? "Submit failed");
      return;
    }
    router.push(b.redirectTo);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Psychometric Attempt</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{testTitle}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1">Status: {attemptStatus}</span>
          <span>{answered}/{questions.length} answered</span>
          <span>{saving ? "Autosaving…" : dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const selection = answers[q.id];
          const checkedValues = Array.isArray(selection) ? (selection as string[]) : [];
          const scaleMin = q.min_scale_value ?? 1;
          const scaleMax = q.max_scale_value ?? 5;
          const scaleValue = Number(selection ?? scaleMin);

          return (
            <div key={q.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${missing.includes(q.id) ? "border-rose-400" : "border-slate-200"}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-500">Question {i + 1}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${q.is_required ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{q.is_required ? "Required" : "Optional"}</span>
              </div>
              <p className="text-base font-medium text-slate-900">{q.question_text}</p>
              {q.help_text ? <p className="mt-2 text-sm text-slate-500">{q.help_text}</p> : null}
              {missing.includes(q.id) ? <p className="mt-2 text-xs text-rose-600">Required question.</p> : null}

              {(q.question_type === "single_choice" || q.question_type === "multiple_choice") && q.options.length === 0 ? (
                <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">Options are not configured for this question.</p>
              ) : null}

              {q.question_type === "single_choice" ? (
                <div className="mt-4 space-y-2">
                  {q.options.map((o) => (
                    <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selection === o.id ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="radio" checked={selection === o.id} onChange={() => save(q, o.id)} className="h-4 w-4" />
                      <span className="text-sm text-slate-800">{o.option_text}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {q.question_type === "multiple_choice" ? (
                <div className="mt-4 space-y-2">
                  {q.options.map((o) => (
                    <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checkedValues.includes(o.id) ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checkedValues.includes(o.id)}
                        onChange={(e) => save(q, e.target.checked ? [...checkedValues, o.id] : checkedValues.filter((x) => x !== o.id))}
                      />
                      <span className="text-sm text-slate-800">{o.option_text}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {q.question_type === "scale" ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Min: {scaleMin}</span>
                    <span className="font-semibold text-slate-800">Selected: {scaleValue}</span>
                    <span>Max: {scaleMax}</span>
                  </div>
                  <input type="range" min={scaleMin} max={scaleMax} value={scaleValue} onChange={(e) => save(q, e.target.value)} className="w-full accent-brand-600" />
                </div>
              ) : null}

              {q.question_type === "numeric" ? (
                <input
                  className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring"
                  type="number"
                  min={0}
                  placeholder="Enter a number"
                  value={String(selection ?? "")}
                  onChange={(e) => save(q, e.target.value)}
                />
              ) : null}

              {q.question_type === "text" ? (
                <div className="mt-4">
                  {!q.is_required ? <p className="mb-2 text-xs text-slate-500">Optional</p> : null}
                  <textarea
                    className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring"
                    placeholder="Write your answer here..."
                    value={String(selection ?? "")}
                    onChange={(e) => save(q, e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/student/purchases?kind=psychometric" className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">Back to My Tests</Link>
        <button disabled={submitting} onClick={submit} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Submitting…" : "Submit Test"}</button>
      </div>
      {msg ? <p className="mt-3 text-sm text-slate-600">{msg}</p> : null}
      {autosaveError ? <p className="mt-2 text-sm font-medium text-rose-600">{autosaveError}</p> : null}
    </div>
  );
}
