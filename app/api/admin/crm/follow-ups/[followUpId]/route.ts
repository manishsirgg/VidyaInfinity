import { NextResponse } from "next/server";

import { createCrmActivity } from "@/lib/admin/crm";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CRM_FOLLOW_UP_STATUSES } from "@/lib/institute/crm-enums";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { followUpId } = await params;
  if (!isUuid(followUpId)) {
    return NextResponse.json({ error: "Invalid follow-up id" }, { status: 400 });
  }

  const body = await request.json();
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

  if (!CRM_FOLLOW_UP_STATUSES.includes(status as (typeof CRM_FOLLOW_UP_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid follow-up status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: existing, error: lookupError } = await admin.data
    .from("crm_follow_ups")
    .select("id,contact_id,status")
    .eq("id", followUpId)
    .maybeSingle();

  if (lookupError || !existing) {
    return NextResponse.json({ error: lookupError?.message ?? "Follow-up not found" }, { status: 404 });
  }

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === "completed" ? new Date().toISOString() : null,
  };

  const { data, error } = await admin.data.from("crm_follow_ups").update(updatePayload).eq("id", followUpId).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: nextPendingFollowUp, error: nextPendingError } = await admin.data
    .from("crm_follow_ups")
    .select("due_at")
    .eq("contact_id", existing.contact_id)
    .eq("status", "scheduled")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ due_at: string }>();

  if (nextPendingError) return NextResponse.json({ error: nextPendingError.message }, { status: 500 });

  const { error: contactUpdateError } = await admin.data
    .from("crm_contacts")
    .update({
      next_follow_up_at: nextPendingFollowUp?.due_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.contact_id);

  if (contactUpdateError) return NextResponse.json({ error: contactUpdateError.message }, { status: 500 });

  if (existing.status !== status) {
    await createCrmActivity({
      contactId: existing.contact_id,
      adminUserId: auth.user.id,
      activityType: status === "completed" ? "follow_up_completed" : status === "cancelled" ? "follow_up_cancelled" : "follow_up_updated",
      title: `Follow-up ${status}`,
      description: `${existing.status} → ${status}`,
      metadata: { followUpId, before: existing.status, after: status },
    });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_FOLLOW_UP_UPDATED",
    targetTable: "crm_follow_ups",
    targetId: followUpId,
    metadata: { before: existing.status, after: status },
  });

  return NextResponse.json({ followUp: data });
}
