import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const CRM_STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;
export const CRM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CRM_FOLLOWUP_STATUS = ["pending", "completed", "cancelled"] as const;
export const CRM_FOLLOWUP_CHANNEL = ["call", "email", "whatsapp", "sms", "meeting", "other"] as const;
export const CRM_NOTE_TYPES = ["general", "call", "email", "meeting", "internal"] as const;
export const CRM_ACTIVITY_TYPES = ["note_added", "follow_up_created", "follow_up_completed", "status_changed", "priority_changed", "contact_updated"] as const;

export async function requireInstituteApiContext() {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return { error: auth.error };

  const admin = getSupabaseAdmin();
  if (!admin.ok) return { error: NextResponse.json({ error: admin.error }, { status: 500 }) };

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle();
  if (!institute?.id) {
    return { error: NextResponse.json({ error: "Institute profile not found" }, { status: 403 }) };
  }

  return { admin: admin.data, userId: auth.user.id, instituteId: institute.id };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function inValues<T extends readonly string[]>(v: string, values: T): v is T[number] {
  return values.includes(v as T[number]);
}
