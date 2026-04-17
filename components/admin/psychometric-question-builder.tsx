"use client";

import { FormEvent, useState } from "react";

export function PsychometricQuestionBuilder({ testId }: { testId: string }) {
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const options = [
      { label: String(formData.get("option1") ?? ""), score: Number(formData.get("score1") ?? 0) },
      { label: String(formData.get("option2") ?? ""), score: Number(formData.get("score2") ?? 0) },
      { label: String(formData.get("option3") ?? ""), score: Number(formData.get("score3") ?? 0) },
      { label: String(formData.get("option4") ?? ""), score: Number(formData.get("score4") ?? 0) },
    ].filter((option) => option.label.trim().length);

    const response = await fetch(`/api/admin/psychometric-tests/${testId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionText: formData.get("questionText"),
        marks: Number(formData.get("marks") ?? 1),
        options,
      }),
    });

    const body = await response.json();
    setMessage(response.ok ? "Question added" : body.error ?? "Failed to add question");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-2 rounded border p-3">
      <textarea name="questionText" required placeholder="Question text" className="rounded border px-2 py-1" />
      <input name="marks" type="number" min={1} defaultValue={1} className="rounded border px-2 py-1" />
      {[1, 2, 3, 4].map((index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <input name={`option${index}`} placeholder={`Option ${index}`} className="rounded border px-2 py-1" />
          <input
            name={`score${index}`}
            type="number"
            step="0.01"
            placeholder="Score"
            className="rounded border px-2 py-1"
          />
        </div>
      ))}
      <button className="rounded bg-brand-600 px-3 py-1.5 text-white" type="submit">
        Add Question
      </button>
      {message && <p className="text-xs text-slate-700">{message}</p>}
    </form>
  );
}
