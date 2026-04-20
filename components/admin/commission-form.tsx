"use client";

import { FormEvent, useMemo, useState } from "react";

import { ORGANIZATION_TYPE_OPTIONS, type OrganizationType } from "@/lib/constants/organization-types";

type EntityCommission = {
  entityType: OrganizationType;
  commissionPercent: number;
};

type CommissionFormProps = {
  initialEntityCommissions: EntityCommission[];
  initialWebinarCommissionPercent: number;
};

export function CommissionForm({ initialEntityCommissions, initialWebinarCommissionPercent }: CommissionFormProps) {
  const [entityMsg, setEntityMsg] = useState("");
  const [webinarMsg, setWebinarMsg] = useState("");
  const [isSavingEntity, setIsSavingEntity] = useState(false);
  const [isSavingWebinar, setIsSavingWebinar] = useState(false);

  const initialEntityMap = useMemo(
    () => Object.fromEntries(initialEntityCommissions.map((item) => [item.entityType, item.commissionPercent])),
    [initialEntityCommissions]
  );

  async function onSaveEntityCommissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEntityMsg("");
    setIsSavingEntity(true);

    try {
      const formData = new FormData(event.currentTarget);
      const entityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => ({
        entityType,
        commissionPercent: Number(formData.get(entityType)),
      }));

      const response = await fetch("/api/admin/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityCommissions }),
      });

      const body = await response.json();
      setEntityMsg(response.ok ? "Course commissions updated." : body.error ?? "Failed to update commissions.");
    } catch {
      setEntityMsg("Unexpected error while updating commissions.");
    } finally {
      setIsSavingEntity(false);
    }
  }

  async function onSaveWebinarCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWebinarMsg("");
    setIsSavingWebinar(true);

    try {
      const formData = new FormData(event.currentTarget);
      const webinarCommissionPercent = Number(formData.get("webinarCommissionPercent"));

      const response = await fetch("/api/admin/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webinarCommissionPercent }),
      });

      const body = await response.json();
      setWebinarMsg(response.ok ? "Webinar commission updated." : body.error ?? "Failed to update commission.");
    } catch {
      setWebinarMsg("Unexpected error while updating webinar commission.");
    } finally {
      setIsSavingWebinar(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Course commission by entity type</h2>
        <p className="mt-1 text-sm text-slate-600">Set fixed commission percentages per institute entity type.</p>

        <form onSubmit={onSaveEntityCommissions} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ORGANIZATION_TYPE_OPTIONS.map((entityType) => (
              <div key={entityType}>
                <label className="mb-1 block text-sm font-medium text-slate-700">{entityType}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  name={entityType}
                  required
                  defaultValue={initialEntityMap[entityType] ?? 12}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSavingEntity}
              className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSavingEntity ? "Saving..." : "Save course commissions"}
            </button>
            {entityMsg && <p className="text-sm text-slate-700">{entityMsg}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Global webinar commission</h2>
        <p className="mt-1 text-sm text-slate-600">Set one commission percentage for all paid webinars.</p>

        <form onSubmit={onSaveWebinarCommission} className="mt-4 flex flex-col gap-3 sm:max-w-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Webinar commission (%)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              name="webinarCommissionPercent"
              required
              defaultValue={initialWebinarCommissionPercent}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSavingWebinar}
              className="w-fit rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSavingWebinar ? "Saving..." : "Save webinar commission"}
            </button>
            {webinarMsg && <p className="text-sm text-slate-700">{webinarMsg}</p>}
          </div>
        </form>
      </section>
    </div>
  );
}
