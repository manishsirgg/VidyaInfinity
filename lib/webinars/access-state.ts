import type { SupabaseClient } from "@supabase/supabase-js";

export type WebinarAccessState = "granted" | "pending_reconciliation" | "none";

export async function getWebinarAccessState(supabase: SupabaseClient, webinarId: string, studentId: string): Promise<WebinarAccessState> {
  const [{ data: paidOrder }, { data: registration }] = await Promise.all([
    supabase
      .from("webinar_orders")
      .select("id,payment_status,order_status,paid_at,created_at")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .eq("payment_status", "paid")
      .in("order_status", ["confirmed", "completed"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string; payment_status: string | null; order_status: string | null; paid_at: string | null; created_at: string | null }>(),
    supabase
      .from("webinar_registrations")
      .select("id,payment_status,access_status")
      .eq("webinar_id", webinarId)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle<{ id: string; payment_status: string | null; access_status: string | null }>(),
  ]);

  if (paidOrder) {
    return registration?.access_status === "granted" ? "granted" : "pending_reconciliation";
  }

  if (registration && registration.payment_status === "not_required") {
    return "granted";
  }

  return "none";
}
