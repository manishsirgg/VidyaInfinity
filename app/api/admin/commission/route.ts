import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { ORGANIZATION_TYPE_OPTIONS, normalizeOrganizationType, type OrganizationType } from "@/lib/constants/organization-types";
import { sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_COMMISSION_PERCENT = 12;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

type EntityCommissionPayload = {
  entityType: string;
  commissionPercent: number;
};

type EntityCommissionRow = {
  entity_type: string;
  commission_percent: number | string | null;
  is_active: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

type AdminSupabaseClient = SupabaseClient;

function withNoStoreHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(name, value);
  return response;
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
  });
}

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

async function loadCommissionSettings(admin: AdminSupabaseClient) {
  const [{ data: entityRows, error: entityError }, { data: webinarRow, error: webinarError }] = await Promise.all([
    admin
      .from("entity_commissions")
      .select("entity_type,commission_percent,is_active,updated_at,created_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<EntityCommissionRow[]>(),
    admin
      .from("webinar_commission_settings")
      .select("commission_percent")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ commission_percent: number | string | null }>(),
  ]);

  if (entityError) return { error: `Unable to read entity commissions: ${entityError.message}` };
  if (webinarError) return { error: `Unable to read webinar commission settings: ${webinarError.message}` };

  const entityMap = new Map<string, number>();
  for (const row of entityRows ?? []) {
    const normalizedType = normalizeOrganizationType(row.entity_type);
    if (!normalizedType || normalizedType === "School" || entityMap.has(normalizedType)) continue;

    const commissionPercent = sanitizeCommissionPercentage(row.commission_percent);
    if (commissionPercent !== null) entityMap.set(normalizedType, commissionPercent);
  }

  const entityCommissions = ORGANIZATION_TYPE_OPTIONS.map((entityType) => ({
    entityType: entityType.value,
    commissionPercent: entityMap.get(entityType.value) ?? DEFAULT_COMMISSION_PERCENT,
  }));
  const webinarCommissionPercent = sanitizeCommissionPercentage(webinarRow?.commission_percent) ?? DEFAULT_COMMISSION_PERCENT;

  return {
    entityRows: entityRows ?? [],
    entityCommissions,
    webinarCommissionPercent,
  };
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return withNoStoreHeaders(auth.error!);

  const admin = getSupabaseAdmin();
  if (!admin.ok) return jsonNoStore({ error: admin.error }, { status: 500 });

  const settings = await loadCommissionSettings(admin.data);
  if ("error" in settings) return jsonNoStore({ error: settings.error }, { status: 500 });

  console.info("[api/admin/commission] loaded commission settings", {
    entityRows: settings.entityRows.map((row) => ({
      entityType: row.entity_type,
      commissionPercent: row.commission_percent,
      isActive: row.is_active,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    })),
    normalizedEntityCommissions: settings.entityCommissions,
    webinarCommissionPercent: settings.webinarCommissionPercent,
  });

  return jsonNoStore({
    entityCommissions: settings.entityCommissions,
    webinarCommissionPercent: settings.webinarCommissionPercent,
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

    console.info("[api/admin/commission] submitted commission settings", {
      entityCommissions: hasEntityCommissions ? payload.entityCommissions : undefined,
      webinarCommissionPercent: hasWebinarCommission ? payload.webinarCommissionPercent : undefined,
    });

    if (hasEntityCommissions) {
      if (!isEntityCommissionPayload(payload.entityCommissions)) {
        return NextResponse.json({ error: "entityCommissions must be a valid array" }, { status: 400 });
      }

      const uniqueTypes = new Set<string>();
      const rows = [] as { entity_type: OrganizationType; commission_percent: number; is_active: boolean }[];
      for (const item of payload.entityCommissions) {
        const normalizedType = normalizeOrganizationType(item.entityType);
        if (!normalizedType) {
          return NextResponse.json({ error: `Unsupported entityType: ${item.entityType}` }, { status: 400 });
        }
        if (uniqueTypes.has(normalizedType)) {
          return NextResponse.json({ error: `Duplicate entityType: ${normalizedType}` }, { status: 400 });
        }

        const value = sanitizeCommissionPercentage(item.commissionPercent);
        if (value === null) {
          return NextResponse.json({ error: `Invalid commissionPercent for ${item.entityType}` }, { status: 400 });
        }

        uniqueTypes.add(normalizedType);
        rows.push({ entity_type: normalizedType, commission_percent: value, is_active: true });
      }

      const missingTypes = ORGANIZATION_TYPE_OPTIONS.filter((option) => !uniqueTypes.has(option.value));
      if (missingTypes.length > 0) {
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
        .order("created_at", { ascending: false })
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

    const settings = await loadCommissionSettings(admin.data);
    if ("error" in settings) return NextResponse.json({ error: settings.error }, { status: 500 });

    console.info("[api/admin/commission] saved commission settings", {
      normalizedEntityCommissions: settings.entityCommissions,
      webinarCommissionPercent: settings.webinarCommissionPercent,
    });

    return NextResponse.json({
      ok: true,
      entityCommissions: settings.entityCommissions,
      webinarCommissionPercent: settings.webinarCommissionPercent,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update commission settings" },
      { status: 500 }
    );
  }
}
