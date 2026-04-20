import { CommissionForm } from "@/components/admin/commission-form";
import { requireUser } from "@/lib/auth/get-session";
import { ORGANIZATION_TYPE_OPTIONS } from "@/lib/constants/organization-types";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const defaultCommission = 12;

  const { data: entityRows } = await supabase
    .from("entity_commissions")
    .select("entity_type,commission_percent,is_active")
    .eq("is_active", true);

  const entityMap = new Map<string, number>();
  for (const row of entityRows ?? []) {
    entityMap.set(row.entity_type, Number(row.commission_percent));
  }

  const initialEntityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => ({
    entityType,
    commissionPercent: entityMap.get(entityType) ?? defaultCommission,
  }));

  const { data: webinarSetting } = await supabase
    .from("webinar_commission_settings")
    .select("commission_percent")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initialWebinarCommissionPercent = Number(webinarSetting?.commission_percent ?? defaultCommission);

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
