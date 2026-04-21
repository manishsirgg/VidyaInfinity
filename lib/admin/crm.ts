import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CrmActivityType =
  | "lead_created"
  | "status_changed"
  | "priority_changed"
  | "assignment_changed"
  | "note_added"
  | "follow_up_created"
  | "follow_up_completed"
  | "follow_up_cancelled"
  | "follow_up_updated"
  | "tags_updated"
  | "contact_updated";

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
  return ["new", "contacted", "qualified", "converted", "lost"].includes(value);
}

export function isCrmPriority(value: string) {
  return ["low", "medium", "high", "urgent"].includes(value);
}
