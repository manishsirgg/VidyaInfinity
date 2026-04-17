"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password reset successful. You can now log in with your new password.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <input required type="password" name="password" minLength={8} placeholder="New password" className="rounded border px-3 py-2" />
      <input required type="password" name="confirmPassword" minLength={8} placeholder="Confirm new password" className="rounded border px-3 py-2" />
      <button disabled={loading} type="submit" className="rounded bg-brand-600 px-4 py-2 text-white">
        {loading ? "Resetting..." : "Reset password"}
      </button>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
