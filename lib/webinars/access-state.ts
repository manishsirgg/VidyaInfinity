import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveWebinarJoinAccess } from "@/lib/webinars/join-access";

export type WebinarAccessState = "granted" | "pending_reconciliation" | "none" | "revoked" | "refunded" | "locked_until_window";

export async function getWebinarAccessState(supabase: SupabaseClient, webinarId: string, studentId: string): Promise<WebinarAccessState> {
  const { data: paidOrder } = await supabase
    .from("webinar_orders")
    .select("id,payment_status,order_status")
    .eq("webinar_id", webinarId)
    .eq("student_id", studentId)
    .eq("payment_status", "paid")
    .in("order_status", ["confirmed", "completed"])
    .limit(1)
    .maybeSingle<{ id: string; payment_status: string | null; order_status: string | null }>();

  const resolved = await resolveWebinarJoinAccess(supabase, studentId, webinarId);

  if (resolved.decision === "allowed") return "granted";
  if (resolved.decision === "waiting_for_reveal_window") return "locked_until_window";
  if (resolved.decision === "denied_refunded") return "refunded";
  if (resolved.decision === "denied_revoked") return "revoked";

  if (paidOrder) return "pending_reconciliation";
  return "none";
}
