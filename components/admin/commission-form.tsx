"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ORGANIZATION_TYPE_OPTIONS, type OrganizationType } from "@/lib/constants/organization-types";

type EntityCommission = {
  entityType: OrganizationType;
  commissionPercent: number;
};

type CommissionFormProps = {
  initialEntityCommissions: EntityCommission[];
  initialWebinarCommissionPercent: number;
};

type CommissionSettingsResponse = {
  entityCommissions?: EntityCommission[];
  webinarCommissionPercent?: number;
  error?: string;
};

function buildEntityValueMap(entityCommissions: EntityCommission[]) {
  return Object.fromEntries(entityCommissions.map((item) => [item.entityType, item.commissionPercent])) as Record<
    OrganizationType,
    number
  >;
}

export function CommissionForm({ initialEntityCommissions, initialWebinarCommissionPercent }: CommissionFormProps) {
  const router = useRouter();
  const [entityMsg, setEntityMsg] = useState("");
  const [webinarMsg, setWebinarMsg] = useState("");
  const [isSavingEntity, setIsSavingEntity] = useState(false);
  const [isSavingWebinar, setIsSavingWebinar] = useState(false);

  const initialEntityMap = useMemo(() => buildEntityValueMap(initialEntityCommissions), [initialEntityCommissions]);

  const [entityValues, setEntityValues] = useState<Record<OrganizationType, number>>(initialEntityMap);
  const [webinarValue, setWebinarValue] = useState(initialWebinarCommissionPercent);

  useEffect(() => {
    setEntityValues(initialEntityMap);
  }, [initialEntityMap]);

  useEffect(() => {
    setWebinarValue(initialWebinarCommissionPercent);
  }, [initialWebinarCommissionPercent]);

  async function onSaveEntityCommissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEntityMsg("");
    setIsSavingEntity(true);

    try {
      const formData = new FormData(event.currentTarget);
      const entityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => ({
        entityType: entityType.value,
        commissionPercent: Number(formData.get(entityType.value)),
      }));

      const response = await fetch("/api/admin/commission", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityCommissions }),
      });

      const body = (await response.json()) as CommissionSettingsResponse;
      if (response.ok) {
        setEntityValues(buildEntityValueMap(body.entityCommissions ?? entityCommissions));
        if (typeof body.webinarCommissionPercent === "number") setWebinarValue(body.webinarCommissionPercent);
        setEntityMsg("Course commissions updated.");
        router.refresh();
      } else {
        setEntityMsg(body.error ?? "Failed to update commissions.");
      }
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
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webinarCommissionPercent }),
      });

      const body = (await response.json()) as CommissionSettingsResponse;
      if (response.ok) {
        if (body.entityCommissions) setEntityValues(buildEntityValueMap(body.entityCommissions));
        setWebinarValue(body.webinarCommissionPercent ?? webinarCommissionPercent);
        setWebinarMsg("Webinar commission updated.");
        router.refresh();
      } else {
        setWebinarMsg(body.error ?? "Failed to update commission.");
      }
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
              <div key={entityType.value}>
                <label className="mb-1 block text-sm font-medium text-slate-700">{entityType.label}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  name={entityType.value}
                  required
                  value={entityValues[entityType.value] ?? 12}
                  onChange={(event) =>
                    setEntityValues((current) => ({
                      ...current,
                      [entityType.value]: Number(event.target.value),
                    }))
                  }
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
              value={webinarValue}
              onChange={(event) => setWebinarValue(Number(event.target.value))}
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
