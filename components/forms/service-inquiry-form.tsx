"use client";

import { FormEvent, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

const serviceOptions = [
  "Career Guidance",
  "Admission Support",
  "Visa Assistance",
  "Other Support / Query",
] as const;

export function ServiceInquiryForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      inquiryType: formData.get("inquiryType"),
      message: formData.get("message"),
    };

    try {
      const response = await fetch("/api/service-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to submit your request right now.");
      }

      setState("success");
      form.reset();
    } catch (submitError) {
      setState("error");
      setError(submitError instanceof Error ? submitError.message : "Unable to submit your request right now.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Get personalised guidance</h2>
      <p className="text-sm text-slate-600">Submit your details and our team will contact you quickly.</p>

      <input required name="name" placeholder="Full name" className="rounded border px-3 py-2" />
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input required name="phone" placeholder="WhatsApp / contact number" className="rounded border px-3 py-2" />

      <select required name="inquiryType" className="rounded border px-3 py-2">
        <option value="">Select service</option>
        {serviceOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <textarea
        name="message"
        placeholder="Anything specific you need support with?"
        className="min-h-28 rounded border px-3 py-2"
      />

      <button
        type="submit"
        disabled={state === "submitting"}
        className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-70"
      >
        {state === "submitting" ? "Submitting..." : "Submit"}
      </button>

      {state === "success" && (
        <p className="text-sm text-emerald-700">Thank you! Your request has been submitted successfully.</p>
      )}
      {state === "error" && <p className="text-sm text-rose-700">{error ?? "Something went wrong."}</p>}
    </form>
  );
}
