"use client";

import { FormEvent, useMemo, useState } from "react";

import { FormFeedback } from "@/components/shared/form-feedback";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+\-()\s]{7,20}$/;
const contactOptions = [
  { value: "email", label: "Email only" },
  { value: "whatsapp", label: "WhatsApp / Contact only" },
  { value: "both", label: "Both Email and WhatsApp / Contact" },
] as const;

type ContactPreference = (typeof contactOptions)[number]["value"];

export function LeadForm({ courseId, instituteId }: { courseId: string; instituteId?: string }) {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    contactPreference: "both" as ContactPreference,
  });

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!values.name.trim()) errors.name = "Name is required.";
    if (values.contactPreference === "email" || values.contactPreference === "both") {
      if (!values.email.trim()) errors.email = "Email is required.";
      else if (!emailPattern.test(values.email.trim())) errors.email = "Enter a valid email address.";
    }

    if (values.contactPreference === "whatsapp" || values.contactPreference === "both") {
      if (!values.phone.trim()) errors.phone = "Contact number is required.";
      else if (!phonePattern.test(values.phone.trim())) errors.phone = "Enter a valid phone/WhatsApp number.";
    }

    if (values.message.length > 500) errors.message = "Message can be up to 500 characters.";
    return errors;
  }, [values]);

  const canSubmit = !submitting && Object.keys(fieldErrors).length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    setError("");

    if (!canSubmit) {
      setError("Please correct the highlighted fields before submitting your lead.");
      return;
    }

    setSubmitting(true);

    const payload = {
      fullName: values.name.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      message: values.message.trim() || null,
      courseId,
      instituteId,
      leadTarget: "course" as const,
      source: "course_detail_page",
      metadata: {
        contactPreference: values.contactPreference,
      },
      contactPreference: values.contactPreference,
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      setSubmitting(false);

      if (!response.ok) {
        setError(body?.error ?? "We could not submit your inquiry right now. Please try again in a moment.");
        return;
      }

      setDone(true);
      setValues({ name: "", email: "", phone: "", message: "", contactPreference: "both" });
    } catch {
      setSubmitting(false);
      setError("We could not submit your inquiry right now. Please check your connection and try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-lg border bg-white p-4 sm:p-5">
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
        {fieldErrors.name ? <p className="text-xs text-rose-700">{fieldErrors.name}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Send lead to</span>
        <select
          name="contactPreference"
          value={values.contactPreference}
          onChange={(event) =>
            setValues((prev) => ({ ...prev, contactPreference: event.target.value as ContactPreference }))
          }
          className="rounded border px-3 py-2"
        >
          {contactOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Email {values.contactPreference === "whatsapp" ? "(optional)" : "*"}</span>
        <input
          required={values.contactPreference !== "whatsapp"}
          type="email"
          name="email"
          value={values.email}
          onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        {fieldErrors.email ? <p className="text-xs text-rose-700">{fieldErrors.email}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">
          WhatsApp / contact number {values.contactPreference === "email" ? "(optional)" : "*"}
        </span>
        <input
          required={values.contactPreference !== "email"}
          name="phone"
          value={values.phone}
          onChange={(event) => setValues((prev) => ({ ...prev, phone: event.target.value }))}
          placeholder="WhatsApp / contact number"
          className="rounded border px-3 py-2"
        />
        {fieldErrors.phone ? <p className="text-xs text-rose-700">{fieldErrors.phone}</p> : null}
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-slate-700">Message (optional)</span>
        <textarea
          name="message"
          value={values.message}
          onChange={(event) => setValues((prev) => ({ ...prev, message: event.target.value }))}
          placeholder="Optional message"
          className="rounded border px-3 py-2"
        />
        <span className="text-xs text-slate-500">{values.message.length}/500</span>
        {fieldErrors.message ? <p className="text-xs text-rose-700">{fieldErrors.message}</p> : null}
      </label>

      <button type="submit" disabled={!canSubmit} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60">
        {submitting ? "Submitting..." : "Submit Lead"}
      </button>

      {done ? <FormFeedback tone="success">Your inquiry has been submitted successfully. Our team will contact you shortly.</FormFeedback> : null}
      {error ? <FormFeedback tone="error">{error}</FormFeedback> : null}
    </form>
  );
}
