"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function StudentRegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/register/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: formData.get("fullName"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Registration failed");
      return;
    }

    router.push(body.redirectPath ?? "/student/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <input required name="fullName" placeholder="Full name" className="rounded border px-3 py-2" />
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input
        required
        type="password"
        minLength={8}
        name="password"
        placeholder="Password (min 8 chars)"
        className="rounded border px-3 py-2"
      />
      <button className="rounded bg-brand-600 px-4 py-2 text-white" type="submit">
        Create account
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
