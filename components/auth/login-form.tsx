"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "@/components/shared/form-feedback";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybeError = "error" in error ? (error as { error?: unknown }).error : undefined;
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const nestedMessage = "message" in maybeError ? (maybeError as { message?: unknown }).message : undefined;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
    }
    const maybeMessage = "message" in error ? (error as { message?: unknown }).message : undefined;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return "Email is required.";
    if (!emailPattern.test(email.trim())) return "Enter a valid email address.";
    return "";
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return "";
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return "";
  }, [password, touched.password]);

  const canSubmit = !loading && !emailError && !passwordError && email.trim().length > 0 && password.length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setError("");

    if (!canSubmit) {
      setError("Please fix the highlighted fields before signing in.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(normalizeErrorMessage(body, "Login failed. Please try again."));
      return;
    }

    router.push(body?.redirectPath ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Email</span>
        <input
          required
          type="email"
          name="email"
          value={email}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="rounded border px-3 py-2"
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "login-email-error" : undefined}
        />
        {emailError ? <p id="login-email-error" className="text-xs text-rose-700">{emailError}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Password</span>
        <input
          required
          type="password"
          name="password"
          value={password}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="rounded border px-3 py-2"
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "login-password-error" : undefined}
        />
        {passwordError ? <p id="login-password-error" className="text-xs text-rose-700">{passwordError}</p> : null}
      </label>

      <button disabled={!canSubmit} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60" type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <Link href="/auth/forgot-password" className="text-sm text-brand-700 hover:underline">
        Forgot password?
      </Link>

      {error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
