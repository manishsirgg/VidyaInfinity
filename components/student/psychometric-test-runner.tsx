"use client";

import { useState } from "react";

type Question = {
  id: string;
  question_text: string;
  psychometric_question_options: Array<{ id: string; option_text: string }>;
};

export function PsychometricTestRunner({ testId, questions }: { testId: string; questions: Question[] }) {
  const [attemptId, setAttemptId] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function startAttempt() {
    const response = await fetch("/api/psychometric/attempts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId }),
    });

    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Could not start attempt");
      return;
    }

    setAttemptId(body.attempt.id);
    setMessage("Attempt started. Submit your answers when ready.");
  }

  async function submitAttempt() {
    if (!attemptId) {
      setMessage("Start attempt first");
      return;
    }

    const payload = Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId }));

    const response = await fetch(`/api/psychometric/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });

    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Could not submit attempt");
      return;
    }

    setMessage(`Submitted. Score: ${body.score}. Report: ${body.reportUrl}`);
  }

  return (
    <div className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Test Runner</h2>
      <button className="mt-3 rounded bg-brand-600 px-3 py-1.5 text-white" onClick={startAttempt}>
        Start Attempt
      </button>

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <div key={question.id} className="rounded border p-3">
            <p className="font-medium">
              {index + 1}. {question.question_text}
            </p>
            <div className="mt-2 space-y-1">
              {question.psychometric_question_options?.map((option) => (
                <label key={option.id} className="block text-sm">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    className="mr-2"
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                  />
                  {option.option_text}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="mt-4 rounded bg-emerald-600 px-3 py-1.5 text-white" onClick={submitAttempt}>
        Submit Answers
      </button>
      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
    </div>
  );
}
