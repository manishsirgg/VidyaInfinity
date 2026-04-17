"use client";

import { FormEvent, useState } from "react";

export function CommissionForm({ currentValue }: { currentValue: number }) {
  const [msg, setMsg] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/admin/commission", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPercentage: Number(formData.get("commissionPercentage")) }),
    });

    const body = await response.json();
    setMsg(response.ok ? "Commission updated" : body.error ?? "Failed");
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div>
        <label className="text-sm">Commission (%)</label>
        <input
          type="number"
          step="0.01"
          min={0}
          max={100}
          name="commissionPercentage"
          defaultValue={currentValue}
          className="block rounded border px-3 py-2"
        />
      </div>
      <button type="submit" className="rounded bg-brand-600 px-3 py-2 text-white">
        Update
      </button>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
    </form>
  );
}
