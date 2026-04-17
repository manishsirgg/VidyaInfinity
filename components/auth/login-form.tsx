"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Login failed");
      return;
    }

    router.push(body.redirectPath ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input required type="password" name="password" placeholder="Password" className="rounded border px-3 py-2" />
      <button disabled={loading} className="rounded bg-brand-600 px-4 py-2 text-white" type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <Link href="/auth/forgot-password" className="text-sm text-brand-700 hover:underline">
        Forgot password?
      </Link>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
