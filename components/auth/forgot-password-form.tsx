"use client";

import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email") }),
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Unable to send reset email");
      return;
    }

    setMessage(body.message ?? "Reset link sent");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-white">
        Send reset link
      </button>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
