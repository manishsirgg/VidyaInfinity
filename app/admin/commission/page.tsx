import { CommissionForm } from "@/components/admin/commission-form";
import { requireUser } from "@/lib/auth/get-session";
import { ORGANIZATION_TYPE_OPTIONS, normalizeOrganizationType } from "@/lib/constants/organization-types";
import { sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { DEFAULT_WEBINAR_COMMISSION_PERCENT, getDefaultEntityCommissionPercent } from "@/lib/payments/commission-settings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;


type EntityCommissionRow = {
  entity_type: string;
  commission_percent: number | string | null;
  is_active: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: entityRows } = await supabase
    .from("entity_commissions")
    .select("entity_type,commission_percent,is_active,updated_at,created_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<EntityCommissionRow[]>();

  const entityMap = new Map<string, number>();
  for (const row of entityRows ?? []) {
    const normalizedType = normalizeOrganizationType(row.entity_type);
    if (!normalizedType || normalizedType === "School" || entityMap.has(normalizedType)) continue;

    const commissionPercent = sanitizeCommissionPercentage(row.commission_percent);
    if (commissionPercent !== null) entityMap.set(normalizedType, commissionPercent);
  }

  const initialEntityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => ({
    entityType: entityType.value,
    commissionPercent: entityMap.get(entityType.value) ?? getDefaultEntityCommissionPercent(entityType.value),
  }));

  const { data: webinarSetting } = await supabase
    .from("webinar_commission_settings")
    .select("commission_percent")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ commission_percent: number | string | null }>();

  const initialWebinarCommissionPercent =
    sanitizeCommissionPercentage(webinarSetting?.commission_percent) ?? DEFAULT_WEBINAR_COMMISSION_PERCENT;

  console.info("[admin/commission] loaded commission settings", {
    entityRows: (entityRows ?? []).map((row) => ({
      entityType: row.entity_type,
      commissionPercent: row.commission_percent,
      isActive: row.is_active,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    })),
    normalizedEntityCommissions: initialEntityCommissions,
    webinarCommissionPercent: initialWebinarCommissionPercent,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Commission</h1>
      <CommissionForm
        initialEntityCommissions={initialEntityCommissions}
        initialWebinarCommissionPercent={initialWebinarCommissionPercent}
      />
    </div>
  );
}
