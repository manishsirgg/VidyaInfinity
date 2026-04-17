"use client";

import { FormEvent, useState } from "react";

export function NewsletterForm() {
  const [status, setStatus] = useState<string>("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email: formData.get("email") }),
    });

    setStatus(response.ok ? "Subscribed successfully" : "Subscription failed");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input
        type="email"
        name="email"
        required
        placeholder="Enter your email"
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      <button className="rounded-md bg-brand-600 px-4 py-2 text-white" type="submit">
        Subscribe
      </button>
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </form>
  );
}
