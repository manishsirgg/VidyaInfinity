import { CRM_ACTIVITY_TYPES, CRM_CONTACT_PRIORITIES, CRM_CONTACT_STAGES } from "@/lib/institute/crm-enums";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CrmActivityType = (typeof CRM_ACTIVITY_TYPES)[number] | "assignment_changed" | "follow_up_updated" | "tags_updated";

export async function createCrmActivity({
  contactId,
  adminUserId,
  activityType,
  title,
  description,
  metadata,
}: {
  contactId: string;
  adminUserId?: string | null;
  activityType: CrmActivityType;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: admin.error };

  const { error } = await admin.data.from("crm_activities").insert({
    contact_id: contactId,
    activity_type: activityType,
    title,
    description: description ?? null,
    created_by: adminUserId ?? null,
    metadata: metadata ?? {},
  });

  if (error) return { error: error.message };
  return { error: null };
}

export function isCrmStatus(value: string) {
  return CRM_CONTACT_STAGES.includes(value as (typeof CRM_CONTACT_STAGES)[number]);
}

export function isCrmPriority(value: string) {
  return CRM_CONTACT_PRIORITIES.includes(value as (typeof CRM_CONTACT_PRIORITIES)[number]);
}
