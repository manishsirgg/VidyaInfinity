"use client";

import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";

type SubmitState = "idle" | "submitting" | "success" | "error";

const serviceOptions = [
  "Career Guidance",
  "Admission Support",
  "Visa Assistance",
  "Other Support / Query",
] as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+\-()\s]{7,20}$/;

export function ServiceInquiryForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({ name: "", email: "", phone: "", inquiryType: "", message: "" });

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = "Name is required.";
    if (!values.email.trim()) next.email = "Email is required.";
    else if (!emailPattern.test(values.email.trim())) next.email = "Enter a valid email address.";
    if (!values.phone.trim()) next.phone = "Contact number is required.";
    else if (!phonePattern.test(values.phone.trim())) next.phone = "Enter a valid phone/WhatsApp number.";
    if (!values.inquiryType) next.inquiryType = "Select a service type.";
    if (values.message.length > 1000) next.message = "Message can be up to 1000 characters.";
    return next;
  }, [values]);

  const canSubmit = state !== "submitting" && Object.keys(errors).length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setState("idle");

    if (!canSubmit) {
      setState("error");
      setError("Please fix the highlighted fields before submitting your inquiry.");
      return;
    }

    setState("submitting");

    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      inquiryType: values.inquiryType,
      message: values.message.trim() || null,
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
      setValues({ name: "", email: "", phone: "", inquiryType: "", message: "" });
    } catch (submitError) {
      setState("error");
      setError(submitError instanceof Error ? submitError.message : "Unable to submit your request right now.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Get personalised guidance</h2>
      <p className="text-sm text-slate-600">Submit your details and our team will contact you quickly.</p>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Full name</span>
        <input
          required
          name="name"
          value={values.name}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Full name"
          className="rounded border px-3 py-2"
        />
        {errors.name ? <p className="text-xs text-rose-700">{errors.name}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Email</span>
        <input
          required
          type="email"
          name="email"
          value={values.email}
          onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        {errors.email ? <p className="text-xs text-rose-700">{errors.email}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">WhatsApp / contact number</span>
        <input
          required
          name="phone"
          value={values.phone}
          onChange={(event) => setValues((prev) => ({ ...prev, phone: event.target.value }))}
          placeholder="WhatsApp / contact number"
          className="rounded border px-3 py-2"
        />
        {errors.phone ? <p className="text-xs text-rose-700">{errors.phone}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Service needed</span>
        <select
          required
          name="inquiryType"
          value={values.inquiryType}
          onChange={(event) => setValues((prev) => ({ ...prev, inquiryType: event.target.value }))}
          className="rounded border px-3 py-2"
        >
          <option value="">Select service</option>
          {serviceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {errors.inquiryType ? <p className="text-xs text-rose-700">{errors.inquiryType}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Message (optional)</span>
        <textarea
          name="message"
          value={values.message}
          onChange={(event) => setValues((prev) => ({ ...prev, message: event.target.value }))}
          placeholder="Anything specific you need support with?"
          className="min-h-28 rounded border px-3 py-2"
        />
        <span className="text-xs text-slate-500">{values.message.length}/1000</span>
        {errors.message ? <p className="text-xs text-rose-700">{errors.message}</p> : null}
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-70"
      >
        {state === "submitting" ? "Submitting..." : "Submit"}
      </button>

      {state === "success" ? <FormFeedback tone="success">Thank you! Your request has been submitted successfully.</FormFeedback> : null}
      {state === "error" ? <FormFeedback tone="error">{error ?? "Something went wrong."}</FormFeedback> : null}
    </form>
  );
}
