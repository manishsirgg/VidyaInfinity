"use client";

import { FormEvent, useState } from "react";

import { INSTITUTE_APPROVAL_DOCUMENT_OPTIONS } from "@/lib/constants/institute-documents";

const IDENTITY_DOCUMENT_OPTIONS = [
  { value: "aadhaar_card", label: "Aadhaar Card" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
  { value: "voter_id", label: "Voter ID" },
  { value: "employee_id", label: "Employee ID" },
];

export function KycUploadForm() {
  const [documentCategory, setDocumentCategory] = useState<"identity" | "approval">("approval");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("documentCategory", documentCategory);

    const response = await fetch("/api/institute/documents", {
      method: "POST",
      body: formData,
    });

    const body = await response.json();
    setMessage(response.ok ? "Document uploaded" : body.error ?? "Upload failed");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl border bg-white p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDocumentCategory("approval")}
          className={`rounded border px-3 py-2 text-sm font-medium ${
            documentCategory === "approval" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Institute approval document
        </button>
        <button
          type="button"
          onClick={() => setDocumentCategory("identity")}
          className={`rounded border px-3 py-2 text-sm font-medium ${
            documentCategory === "identity" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Owner identity document
        </button>
      </div>

      <select name="documentType" required className="rounded border px-3 py-2">
        <option value="">Select document type</option>
        {(documentCategory === "approval" ? INSTITUTE_APPROVAL_DOCUMENT_OPTIONS : IDENTITY_DOCUMENT_OPTIONS).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="file"
        name="file"
        accept="application/pdf,image/png,image/jpeg"
        required
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-white">
        Upload Document
      </button>
      {message && <p className="text-xs text-slate-700">{message}</p>}
    </form>
  );
}
