import type { SupabaseClient } from "@supabase/supabase-js";

type RefundTargets = {
  course_order_id: string | null;
  psychometric_order_id: string | null;
  webinar_order_id: string | null;
};

type EnrollmentMutationError = { code?: string | null; message?: string | null; details?: string | null };

function isInvalidEnrollmentEnumValue(error: EnrollmentMutationError | null | undefined, candidate: string) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("invalid input value for enum enrollment_status") && text.includes(candidate.toLowerCase());
}

async function revokeCourseEnrollment(supabase: SupabaseClient, courseOrderId: string, refundedAt: string) {
  const { data: order } = await supabase
    .from("course_orders")
    .select("id,student_id,course_id")
    .eq("id", courseOrderId)
    .maybeSingle<{ id: string; student_id: string; course_id: string }>();

  const basePatch = {
    cancelled_at: refundedAt,
    access_end_at: refundedAt,
    updated_at: refundedAt,
    metadata: { source: "refund_reconciliation" },
  };

  const fallbackStatuses = ["cancelled", "revoked", "inactive"] as const;
  for (const status of fallbackStatuses) {
    const { error } = await supabase
      .from("course_enrollments")
      .update({ ...basePatch, enrollment_status: status })
      .eq("course_order_id", courseOrderId);
    if (!error) return;
    if (!isInvalidEnrollmentEnumValue(error, status)) {
      console.warn("[payments/refund] course_enrollment_revoke_failed", {
        event: "course_enrollment_revoke_failed",
        course_order_id: courseOrderId,
        attempt_status: status,
        error: error.message,
      });
      return;
    }
  }

  if (order) {
    await supabase
      .from("course_enrollments")
      .update(basePatch)
      .eq("student_id", order.student_id)
      .eq("course_id", order.course_id);
  }
}

async function markCourseOrderRefunded(supabase: SupabaseClient, courseOrderId: string, refundedAt: string) {
  const patchWithOrderStatus = {
    payment_status: "refunded",
    order_status: "refunded",
    updated_at: refundedAt,
  };

  const { error } = await supabase.from("course_orders").update(patchWithOrderStatus).eq("id", courseOrderId);
  if (!error) return;

  const normalized = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const canFallback = normalized.includes("order_status") || normalized.includes("column");
  if (!canFallback) return;

  await supabase.from("course_orders").update({ payment_status: "refunded", updated_at: refundedAt }).eq("id", courseOrderId);
}

export async function reconcileRefundAccessAndOrderState({
  supabase,
  targets,
  refundedAt,
}: {
  supabase: SupabaseClient;
  targets: RefundTargets;
  refundedAt?: string;
}) {
  const effectiveRefundedAt = refundedAt ?? new Date().toISOString();

  if (targets.course_order_id) {
    await markCourseOrderRefunded(supabase, targets.course_order_id, effectiveRefundedAt);
    await revokeCourseEnrollment(supabase, targets.course_order_id, effectiveRefundedAt);
  }

  if (targets.psychometric_order_id) {
    await supabase
      .from("psychometric_orders")
      .update({ payment_status: "refunded", updated_at: effectiveRefundedAt })
      .eq("id", targets.psychometric_order_id);
  }

  if (targets.webinar_order_id) {
    await supabase
      .from("webinar_orders")
      .update({
        payment_status: "refunded",
        order_status: "refunded",
        access_status: "revoked",
        updated_at: effectiveRefundedAt,
      })
      .eq("id", targets.webinar_order_id);

    await supabase
      .from("webinar_registrations")
      .update({
        registration_status: "cancelled",
        payment_status: "refunded",
        access_status: "revoked",
        access_end_at: effectiveRefundedAt,
        updated_at: effectiveRefundedAt,
      })
      .eq("webinar_order_id", targets.webinar_order_id);
  }
}
