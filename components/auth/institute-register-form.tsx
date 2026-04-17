"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function InstituteRegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/register/institute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: formData.get("fullName"),
        email: formData.get("email"),
        password: formData.get("password"),
        instituteName: formData.get("instituteName"),
        city: formData.get("city"),
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Registration failed");
      return;
    }

    router.push(body.redirectPath ?? "/institute/kyc");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <input required name="fullName" placeholder="Owner full name" className="rounded border px-3 py-2" />
      <input required name="instituteName" placeholder="Institute name" className="rounded border px-3 py-2" />
      <input name="city" placeholder="City" className="rounded border px-3 py-2" />
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
        Register institute
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
