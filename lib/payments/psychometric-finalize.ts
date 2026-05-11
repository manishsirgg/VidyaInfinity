import type { SupabaseClient } from "@supabase/supabase-js";

type FinalizeSource = "verify_api" | "webhook" | "status_api" | "recovery";

export async function finalizePaidPsychometricOrder({
  supabase,
  psychometricOrderId,
  source,
}: {
  supabase: SupabaseClient;
  psychometricOrderId: string;
  source: FinalizeSource;
}) {
  const { data: order, error: orderError } = await supabase
    .from("psychometric_orders")
    .select("id,user_id,test_id,payment_status,attempt_id,metadata,razorpay_order_id,razorpay_payment_id")
    .eq("id", psychometricOrderId)
    .maybeSingle<{
      id: string;
      user_id: string;
      test_id: string;
      payment_status: string;
      attempt_id: string | null;
      metadata: Record<string, unknown> | null;
      razorpay_order_id: string | null;
      razorpay_payment_id: string | null;
    }>();

  if (orderError) return { error: orderError.message, attemptId: null as string | null, skipped: true };
  if (!order) return { error: "Psychometric order not found", attemptId: null as string | null, skipped: true };
  if (String(order.payment_status).toLowerCase() !== "paid") {
    return { error: null, attemptId: null as string | null, skipped: true };
  }

  const now = new Date().toISOString();
  let attemptId: string | null = null;
  let path = "";

  if (order.attempt_id) {
    const { data: linkedAttempt } = await supabase.from("test_attempts").select("id").eq("id", order.attempt_id).maybeSingle<{ id: string }>();
    if (linkedAttempt?.id) {
      attemptId = linkedAttempt.id;
      path = "order_attempt_id_valid";
    }
  }

  if (!attemptId) {
    const { data: existingByOrder } = await supabase
      .from("test_attempts")
      .select("id")
      .eq("order_id", order.id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existingByOrder?.id) {
      attemptId = existingByOrder.id;
      path = "existing_attempt_by_order_id";
    }
  }

  if (!attemptId) {
    const insertPayload = {
      user_id: order.user_id,
      test_id: order.test_id,
      order_id: order.id,
      status: "in_progress",
      started_at: now,
      metadata: {
        source,
        psychometric_order_id: order.id,
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: order.razorpay_payment_id,
        finalized_at: now,
      },
    };
    const { data: inserted, error: insertError } = await supabase.from("test_attempts").insert(insertPayload).select("id").maybeSingle<{ id: string }>();
    if (insertError) {
      const { data: fallback } = await supabase
        .from("test_attempts")
        .select("id")
        .eq("order_id", order.id)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (!fallback?.id) return { error: insertError.message, attemptId: null as string | null, skipped: false };
      attemptId = fallback.id;
      path = "insert_conflict_fallback_by_order_id";
    } else {
      attemptId = inserted?.id ?? null;
      path = "created_attempt";
    }
  }

  if (!attemptId) return { error: "Unable to resolve psychometric attempt", attemptId: null as string | null, skipped: false };

  const nextMetadata = {
    ...(order.metadata ?? {}),
    finalization: {
      ...((order.metadata as Record<string, unknown> | null)?.finalization as Record<string, unknown> | undefined),
      source,
      finalized_at: now,
      attempt_id: attemptId,
      lookup_path: path,
    },
  };

  const { error: linkError } = await supabase
    .from("psychometric_orders")
    .update({ attempt_id: attemptId, metadata: nextMetadata, updated_at: now })
    .eq("id", order.id);
  if (linkError) return { error: linkError.message, attemptId: null as string | null, skipped: false };

  console.info("[payments/psychometric/finalize] finalized", {
    psychometric_order_id: order.id,
    razorpay_order_id: order.razorpay_order_id,
    razorpay_payment_id: order.razorpay_payment_id,
    attempt_id: attemptId,
    path,
    source,
  });

  return { error: null, attemptId, skipped: false };
}
