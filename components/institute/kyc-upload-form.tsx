"use client";

import { FormEvent, useState } from "react";

export function KycUploadForm() {
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/institute/documents", {
      method: "POST",
      body: formData,
    });

    const body = await response.json();
    setMessage(response.ok ? "Document uploaded" : body.error ?? "Upload failed");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-2 rounded border bg-white p-3">
      <select name="documentType" required className="rounded border px-2 py-1">
        <option value="">Select document type</option>
        <option value="registration_certificate">Registration Certificate</option>
        <option value="tax_document">Tax Document</option>
        <option value="owner_id">Owner ID</option>
      </select>
      <input type="file" name="file" required className="rounded border px-2 py-1" />
      <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-white">
        Upload Document
      </button>
      {message && <p className="text-xs text-slate-700">{message}</p>}
    </form>
  );
}
