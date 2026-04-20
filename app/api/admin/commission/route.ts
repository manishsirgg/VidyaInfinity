import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { ORGANIZATION_TYPE_OPTIONS, isOrganizationType } from "@/lib/constants/organization-types";
import { sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type EntityCommissionPayload = {
  entityType: string;
  commissionPercent: number;
};

function isEntityCommissionPayload(value: unknown): value is EntityCommissionPayload[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      !!item &&
      typeof item === "object" &&
      "entityType" in item &&
      "commissionPercent" in item &&
      typeof (item as EntityCommissionPayload).entityType === "string"
  );
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const defaultCommission = 12;

  const [{ data: entityRows }, { data: webinarRow }] = await Promise.all([
    admin.data.from("entity_commissions").select("entity_type,commission_percent,is_active").eq("is_active", true),
    admin.data
      .from("webinar_commission_settings")
      .select("commission_percent")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ commission_percent: number }>(),
  ]);

  const entityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => {
    const matched = entityRows?.find((row) => row.entity_type === entityType);
    return {
      entityType,
      commissionPercent: sanitizeCommissionPercentage(matched?.commission_percent) ?? defaultCommission,
    };
  });

  return NextResponse.json({
    entityCommissions,
    webinarCommissionPercent: sanitizeCommissionPercentage(webinarRow?.commission_percent) ?? defaultCommission,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const hasEntityCommissions = "entityCommissions" in payload;
    const hasWebinarCommission = "webinarCommissionPercent" in payload;

    if (!hasEntityCommissions && !hasWebinarCommission) {
      return NextResponse.json({ error: "No valid update payload provided" }, { status: 400 });
    }

    if (hasEntityCommissions) {
      if (!isEntityCommissionPayload(payload.entityCommissions)) {
        return NextResponse.json({ error: "entityCommissions must be a valid array" }, { status: 400 });
      }

      const uniqueTypes = new Set<string>();
      const rows = [] as { entity_type: string; commission_percent: number; is_active: boolean }[];
      for (const item of payload.entityCommissions) {
        if (!isOrganizationType(item.entityType)) {
          return NextResponse.json({ error: `Unsupported entityType: ${item.entityType}` }, { status: 400 });
        }
        if (uniqueTypes.has(item.entityType)) {
          return NextResponse.json({ error: `Duplicate entityType: ${item.entityType}` }, { status: 400 });
        }

        const value = sanitizeCommissionPercentage(item.commissionPercent);
        if (value === null) {
          return NextResponse.json({ error: `Invalid commissionPercent for ${item.entityType}` }, { status: 400 });
        }

        uniqueTypes.add(item.entityType);
        rows.push({ entity_type: item.entityType, commission_percent: value, is_active: true });
      }

      if (uniqueTypes.size !== ORGANIZATION_TYPE_OPTIONS.length) {
        return NextResponse.json({ error: "All entity types must be provided" }, { status: 400 });
      }

      const { error } = await admin.data.from("entity_commissions").upsert(rows, { onConflict: "entity_type" });
      if (error) {
        return NextResponse.json({ error: `Unable to update entity commissions: ${error.message}` }, { status: 500 });
      }

      await writeAdminAuditLog({
        adminUserId: auth.user.id,
        action: "ENTITY_COMMISSIONS_UPDATED",
        targetTable: "entity_commissions",
        targetId: "bulk",
        metadata: {
          updatedEntityTypes: rows.map((row) => row.entity_type),
        },
      });
    }

    if (hasWebinarCommission) {
      const webinarValue = sanitizeCommissionPercentage(payload.webinarCommissionPercent);
      if (webinarValue === null) {
        return NextResponse.json({ error: "webinarCommissionPercent must be between 0 and 100" }, { status: 400 });
      }

      const { data: existingSetting } = await admin.data
        .from("webinar_commission_settings")
        .select("id")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (existingSetting?.id) {
        const { error } = await admin.data
          .from("webinar_commission_settings")
          .update({ commission_percent: webinarValue, is_active: true })
          .eq("id", existingSetting.id);

        if (error) {
          return NextResponse.json({ error: `Unable to update webinar commission: ${error.message}` }, { status: 500 });
        }
      } else {
        const { error } = await admin.data
          .from("webinar_commission_settings")
          .insert({ commission_percent: webinarValue, is_active: true });

        if (error) {
          return NextResponse.json({ error: `Unable to create webinar commission: ${error.message}` }, { status: 500 });
        }
      }

      await writeAdminAuditLog({
        adminUserId: auth.user.id,
        action: "WEBINAR_COMMISSION_UPDATED",
        targetTable: "webinar_commission_settings",
        targetId: existingSetting?.id ?? "created",
        metadata: { webinarCommissionPercent: webinarValue },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update commission settings" },
      { status: 500 }
    );
  }
}
