import type { SupabaseClient } from "@supabase/supabase-js";

type AttemptRow = {
  id: string;
  user_id: string;
  test_id: string;
  status: string | null;
  order_id: string | null;
  metadata: Record<string, unknown> | null;
  started_at?: string | null;
};

const PAID_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);
const ANSWERABLE_STATUSES = new Set(["not_started", "in_progress", "unlocked"]);

export function isAttemptAnswerable(status: string | null | undefined) {
  return ANSWERABLE_STATUSES.has(String(status ?? "").toLowerCase());
}

export async function repairPendingPaidAttempt({
  supabase,
  attempt,
  source,
}: {
  supabase: SupabaseClient;
  attempt: AttemptRow;
  source: string;
}) {
  const status = String(attempt.status ?? "").toLowerCase();
  if (status !== "pending") return attempt;

  let order: { id: string; payment_status: string | null; user_id: string } | null = null;
  if (attempt.order_id) {
    const { data } = await supabase.from("psychometric_orders").select("id,payment_status,user_id").eq("id", attempt.order_id).maybeSingle();
    order = data;
  }
  if (!order) {
    const { data } = await supabase.from("psychometric_orders").select("id,payment_status,user_id").eq("attempt_id", attempt.id).maybeSingle();
    order = data;
  }
  if (!order) return attempt;
  if (!PAID_STATUSES.has(String(order.payment_status ?? "").toLowerCase())) return attempt;
  if (order.user_id !== attempt.user_id) return attempt;

  const now = new Date().toISOString();
  const updatePayload = {
    status: "in_progress",
    started_at: attempt.started_at ?? now,
    metadata: {
      ...(attempt.metadata ?? {}),
      status_repair: {
        source,
        previous_status: attempt.status,
        new_status: "in_progress",
        reason: "paid_pending_attempt_read_repair",
        repaired_at: now,
      },
    },
    updated_at: now,
  };

  const { error } = await supabase.from("test_attempts").update(updatePayload).eq("id", attempt.id);
  if (error) {
    console.error("[psychometric-attempt-status-repair] failed", { attemptId: attempt.id, source, error: error.message });
    return attempt;
  }

  return { ...attempt, status: "in_progress", started_at: updatePayload.started_at, metadata: updatePayload.metadata } as AttemptRow;
}
