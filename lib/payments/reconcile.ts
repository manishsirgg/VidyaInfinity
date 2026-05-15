import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { REFUND_ORDER_TYPE_TO_CANONICAL_KIND } from "@/lib/payments/order-kinds";
import { notifyCoursePurchase } from "@/lib/marketplace/course-notifications";
import { notifyWebinarEnrollment } from "@/lib/webinars/enrollment-notifications";
import { deliverWebinarAccess } from "@/lib/webinars/access-delivery";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { logInstituteWalletEvent } from "@/lib/institute/wallet-audit";
import { finalizePaidPsychometricOrder } from "@/lib/payments/psychometric-finalize";
import type { SupabaseClient } from "@supabase/supabase-js";

const COURSE_ACCESS_FALLBACK_DAYS = 180;

function resolveAccessEndAt(startAtIso: string, durationValue: number | null, durationUnit: string | null) {
  
  const startAt = new Date(startAtIso);
  if (Number.isNaN(startAt.getTime())) return null;

  const normalizedUnit = String(durationUnit ?? "").trim().toLowerCase();
  const normalizedDurationValue = Number.isFinite(durationValue) ? Number(durationValue) : 0;

  if (normalizedUnit === "lifetime") {
    return null;
  }

  const resolved = new Date(startAt);

  if (normalizedDurationValue > 0 && ["day", "days"].includes(normalizedUnit)) {
    resolved.setUTCDate(resolved.getUTCDate() + normalizedDurationValue);
  } else if (normalizedDurationValue > 0 && ["week", "weeks"].includes(normalizedUnit)) {
    resolved.setUTCDate(resolved.getUTCDate() + normalizedDurationValue * 7);
  } else if (normalizedDurationValue > 0 && ["month", "months"].includes(normalizedUnit)) {
    resolved.setUTCMonth(resolved.getUTCMonth() + normalizedDurationValue);
  } else if (normalizedDurationValue > 0 && ["year", "years"].includes(normalizedUnit)) {
    resolved.setUTCFullYear(resolved.getUTCFullYear() + normalizedDurationValue);
  } else {
    resolved.setUTCDate(resolved.getUTCDate() + COURSE_ACCESS_FALLBACK_DAYS);
    return resolved.toISOString();
  }

  if (normalizedDurationValue <= 0) {
    resolved.setUTCDate(resolved.getUTCDate() + COURSE_ACCESS_FALLBACK_DAYS);
  }

  return resolved.toISOString();
}

function isUniqueViolation(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  if (!error) return false;
  if (String(error.code ?? "") === "23505") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("duplicate key value violates unique constraint");
}

function isRazorpayTransactionOrderKindConstraintError(error: { message?: string | null; details?: string | null } | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("razorpay_transactions_order_kind_check");
}

function getOrderKindConstraintMigrationHint(error: { message?: string | null; details?: string | null } | null | undefined) {
  if (!isRazorpayTransactionOrderKindConstraintError(error)) return null;
  return "Database schema is missing canonical razorpay_transactions.order_kind values. Run migration 20260425_000038_razorpay_transactions_order_kind_canonical_alignment.sql.";
}

type EnrollmentMutationError = { code?: string | null; message?: string | null; details?: string | null };
const ACTIVE_ENROLLMENT_STATUS = "active" as const;
const ACTIVE_DUPLICATE_PROTECTION_STATUSES = new Set(["pending", "active", "suspended", "completed"]);
async function consumeCouponUsageByCode({
  supabase,
  couponCode,
}: {
  supabase: SupabaseClient;
  couponCode: string | null | undefined;
}) {
  const normalizedCode = String(couponCode ?? "").trim().toUpperCase();
  if (!normalizedCode) return { error: null as string | null };

  const { data: couponRow, error: couponFetchError } = await supabase
    .from("coupons")
    .select("id,max_uses,used_count")
    .eq("code", normalizedCode)
    .maybeSingle<{ id: string; max_uses: number | null; used_count: number }>();
  if (couponFetchError) return { error: couponFetchError.message };
  if (!couponRow) return { error: null as string | null };

  const currentUsedCount = Number(couponRow.used_count ?? 0);
  const maxUses = couponRow.max_uses;
  if (maxUses !== null && currentUsedCount >= maxUses) return { error: null as string | null };

  const { error: couponUpdateError } = await supabase
    .from("coupons")
    .update({ used_count: currentUsedCount + 1 })
    .eq("id", couponRow.id)
    .eq("used_count", currentUsedCount);
  if (couponUpdateError) return { error: couponUpdateError.message };
  return { error: null as string | null };
}

async function withEnrollmentStatusFallback(
  operation: (enrollmentStatus: typeof ACTIVE_ENROLLMENT_STATUS) => PromiseLike<{ error: EnrollmentMutationError | null }>,
) {
  return operation(ACTIVE_ENROLLMENT_STATUS);
}

async function createInstitutePayoutForCourseOrder({
  supabase,
  orderId,
  source,
}: {
  supabase: SupabaseClient;
  orderId: string;
  source: "verify_api" | "webhook";
}) {
  const { data: paidOrder, error: paidOrderError } = await supabase
    .from("course_orders")
    .select("id,institute_id,gross_amount,platform_fee_amount,institute_receivable_amount,paid_at")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      institute_id: string;
      gross_amount: number;
      platform_fee_amount: number | null;
      institute_receivable_amount: number;
      paid_at: string | null;
    }>();

  if (paidOrderError || !paidOrder) {
    const errorMessage = paidOrderError?.message ?? "Unable to load paid course order for payout creation.";
    console.error("[payments/reconcile] institute_payout_course_load_failed", {
      event: "institute_payout_course_load_failed",
      course_order_id: orderId,
      source,
      error: errorMessage,
    });
    return { error: errorMessage };
  }

  const { data: existingPayoutRow } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("course_order_id", paidOrder.id)
    .maybeSingle<{ id: string }>();

  if (existingPayoutRow?.id) {
    return { error: null as string | null };
  }

  const availableAt = paidOrder.paid_at ?? new Date().toISOString();
  const { error: payoutInsertError } = await supabase.from("institute_payouts").insert(
    {
      institute_id: paidOrder.institute_id,
      course_order_id: paidOrder.id,
      source_reference_id: paidOrder.id,
      source_reference_type: "course_order",
      payout_source: "course",
      gross_amount: paidOrder.gross_amount,
      platform_fee_amount: paidOrder.platform_fee_amount ?? 0,
      payout_amount: paidOrder.institute_receivable_amount,
      payout_status: "available",
      available_at: availableAt,
      updated_at: new Date().toISOString(),
    },
  );

  if (payoutInsertError) {
    if (isUniqueViolation(payoutInsertError)) {
      return { error: null as string | null };
    }
    await logInstituteWalletEvent(
      {
        instituteId: paidOrder.institute_id,
        eventType: "wallet_sync_failed",
        sourceTable: "course_orders",
        sourceId: paidOrder.id,
        orderId: paidOrder.id,
        orderKind: "course",
        amount: paidOrder.institute_receivable_amount,
        actorRole: "system",
        idempotencyKey: `wallet_sync_failed:course:${paidOrder.id}:${source}`,
        metadata: { source, reason: payoutInsertError.message },
      },
      supabase
    );
    console.error("[payments/reconcile] institute_payout_course_insert_failed", {
      event: "institute_payout_course_insert_failed",
      course_order_id: orderId,
      source,
      error: payoutInsertError.message,
    });
    return { error: payoutInsertError.message };
  }

  const { data: payoutRow } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("course_order_id", paidOrder.id)
    .maybeSingle<{ id: string }>();

  await logInstituteWalletEvent(
    {
      instituteId: paidOrder.institute_id,
      eventType: "payment_credited",
      sourceTable: "course_orders",
      sourceId: paidOrder.id,
      payoutId: payoutRow?.id ?? null,
      orderId: paidOrder.id,
      orderKind: "course",
      amount: paidOrder.institute_receivable_amount,
      actorRole: "system",
      idempotencyKey: `course_payout:${paidOrder.id}`,
      metadata: { source, available_at: availableAt },
    },
    supabase
  );

  return { error: null as string | null };
}

async function createInstitutePayoutForWebinarOrder({
  supabase,
  orderId,
  source,
}: {
  supabase: SupabaseClient;
  orderId: string;
  source: "verify_api" | "webhook";
}) {
  const { data: paidOrder, error: paidOrderError } = await supabase
    .from("webinar_orders")
    .select("id,institute_id,amount,platform_fee_amount,payout_amount,paid_at,created_at")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      institute_id: string;
      amount: number;
      platform_fee_amount: number | null;
      payout_amount: number | null;
      paid_at: string | null;
      created_at: string | null;
    }>();

  if (paidOrderError || !paidOrder) {
    const errorMessage = paidOrderError?.message ?? "Unable to load paid webinar order for payout creation.";
    console.error("[payments/reconcile] institute_payout_webinar_load_failed", {
      event: "institute_payout_webinar_load_failed",
      webinar_order_id: orderId,
      source,
      error: errorMessage,
    });
    return { error: errorMessage };
  }

  const { data: existingPayoutRow } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("webinar_order_id", paidOrder.id)
    .maybeSingle<{ id: string }>();

  if (existingPayoutRow?.id) {
    return { error: null as string | null };
  }

  const grossAmount = Number(paidOrder.amount ?? 0);
  const platformFeeAmount = Number(paidOrder.platform_fee_amount ?? 0);
  const payoutAmount = Number(paidOrder.payout_amount ?? Math.max(grossAmount - platformFeeAmount, 0));
  const availableAt = paidOrder.paid_at ?? paidOrder.created_at ?? new Date().toISOString();

  const { error: payoutInsertError } = await supabase.from("institute_payouts").insert(
    {
      institute_id: paidOrder.institute_id,
      webinar_order_id: paidOrder.id,
      source_reference_id: paidOrder.id,
      source_reference_type: "webinar_order",
      payout_source: "webinar",
      gross_amount: grossAmount,
      platform_fee_amount: platformFeeAmount,
      payout_amount: payoutAmount,
      payout_status: "available",
      available_at: availableAt,
      updated_at: new Date().toISOString(),
    },
  );

  if (payoutInsertError) {
    if (isUniqueViolation(payoutInsertError)) {
      return { error: null as string | null };
    }
    await logInstituteWalletEvent(
      {
        instituteId: paidOrder.institute_id,
        eventType: "wallet_sync_failed",
        sourceTable: "webinar_orders",
        sourceId: paidOrder.id,
        orderId: paidOrder.id,
        orderKind: "webinar",
        amount: payoutAmount,
        actorRole: "system",
        idempotencyKey: `wallet_sync_failed:webinar:${paidOrder.id}:${source}`,
        metadata: { source, reason: payoutInsertError.message },
      },
      supabase
    );
    console.error("[payments/reconcile] institute_payout_webinar_insert_failed", {
      event: "institute_payout_webinar_insert_failed",
      webinar_order_id: orderId,
      source,
      error: payoutInsertError.message,
    });
    return { error: payoutInsertError.message };
  }

  const { data: payoutRow } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("webinar_order_id", paidOrder.id)
    .maybeSingle<{ id: string }>();

  await logInstituteWalletEvent(
    {
      instituteId: paidOrder.institute_id,
      eventType: "payment_credited",
      sourceTable: "webinar_orders",
      sourceId: paidOrder.id,
      payoutId: payoutRow?.id ?? null,
      orderId: paidOrder.id,
      orderKind: "webinar",
      amount: payoutAmount,
      actorRole: "system",
      idempotencyKey: `webinar_payout:${paidOrder.id}`,
      metadata: { source, available_at: availableAt },
    },
    supabase
  );

  return { error: null as string | null };
}

export async function reconcileCourseOrderPaid({
  supabase,
  order,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  source,
  adminUserId,
  gatewayResponse,
}: {
  supabase: SupabaseClient;
  order: {
    id: string;
    student_id: string;
    course_id: string;
    institute_id: string;
    gross_amount: number;
    institute_receivable_amount: number;
    currency: string;
    payment_status: string;
    coupon_id?: string | null;
  };
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "verify_api" | "webhook";
  adminUserId?: string;
  gatewayResponse?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  console.info("[payments/reconcile] reconcileCourseOrderPaid:start", { orderId: order.id, razorpayOrderId, razorpayPaymentId, source });

  const canonicalPaidOrderId = order.id;
  let effectivePaidAt = now;

  const findEnrollmentByStudentCourse = async () =>
    supabase
      .from("course_enrollments")
      .select("id,course_order_id,enrollment_status,access_end_at")
      .eq("student_id", order.student_id)
      .eq("course_id", order.course_id)
      .limit(1)
      .maybeSingle<{ id: string; course_order_id: string | null; enrollment_status: string | null; access_end_at: string | null }>();

  const { data: existingEnrollment } = await findEnrollmentByStudentCourse();

  const { data: courseForDuration } = await supabase
    .from("courses")
    .select("duration_value,duration_unit")
    .eq("id", order.course_id)
    .maybeSingle<{ duration_value: number | null; duration_unit: string | null }>();

  const resolvedAccessEndAt = resolveAccessEndAt(effectivePaidAt, courseForDuration?.duration_value ?? null, courseForDuration?.duration_unit ?? null);

  const shouldCountCouponUsage = order.payment_status !== "paid";

  if (shouldCountCouponUsage) {
    const { error: updateError } = await supabase
      .from("course_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: now,
        updated_at: now,
      })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    if (updateError) {
      return { error: updateError.message };
    } else {
      effectivePaidAt = now;
    }
    const consumed = await consumeCouponUsageByCode({
      supabase,
      couponCode: (order as { metadata?: { coupon_code?: string | null } }).metadata?.coupon_code,
    });
    if (consumed.error) return consumed;
  } else if (order.payment_status === "paid") {
    console.info("[payments/reconcile] reconciliation_skipped_already_finalized", {
      event: "reconciliation_skipped_already_finalized",
      orderId: order.id,
      studentId: order.student_id,
      courseId: order.course_id,
      source,
    });

    const { error: paidBackfillError } = await supabase
      .from("course_orders")
      .update({
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
      })
      .eq("id", order.id);

    if (paidBackfillError) {
      console.warn("[payments/reconcile] paid_order_backfill_failed", {
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId,
        source,
        error: paidBackfillError.message,
      });
    }
    effectivePaidAt = now;
  }

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_type: "course",
      order_id: canonicalPaidOrderId,
      order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.course,
      course_order_id: canonicalPaidOrderId,
      user_id: order.student_id,
      institute_id: order.institute_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: order.gross_amount,
      currency: order.currency,
      status: "captured",
      payload: { source, ...(gatewayResponse ?? {}) },
      verified: true,
      verified_at: now,
      gateway_response: { source, ...(gatewayResponse ?? {}) },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) {
    console.error("[payments/reconcile] transaction upsert failed", {
      orderId: order.id,
      course_order_id: order.id,
      razorpayOrderId,
      razorpayPaymentId,
      error: txnError.message,
      source,
    });
    const migrationHint = getOrderKindConstraintMigrationHint(txnError);
    return { error: migrationHint ?? txnError.message };
  }

  console.info("[payments/reconcile] transaction upsert success", {
    orderId: canonicalPaidOrderId,
    course_order_id: canonicalPaidOrderId,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  });

  const buildEnrollmentPayload = (enrollmentStatus: typeof ACTIVE_ENROLLMENT_STATUS) => ({
    order_id: canonicalPaidOrderId,
    user_id: order.student_id,
    course_order_id: canonicalPaidOrderId,
    student_id: order.student_id,
    course_id: order.course_id,
    institute_id: order.institute_id,
    enrollment_status: enrollmentStatus,
    enrolled_at: effectivePaidAt,
    access_start_at: effectivePaidAt,
    access_end_at: resolvedAccessEndAt,
    metadata: { source, reconciled: true },
  });

  const reconcileEnrollmentRow = async (seedEnrollment: { id: string; course_order_id: string | null; enrollment_status: string | null } | null) => {
    if (seedEnrollment) {
      const normalizedStatus = String(seedEnrollment.enrollment_status ?? "").trim().toLowerCase();
      const hasFutureAccess = Boolean(existingEnrollment?.access_end_at && new Date(existingEnrollment.access_end_at).getTime() > Date.now());
      const isProtectedActiveEnrollment = ACTIVE_DUPLICATE_PROTECTION_STATUSES.has(normalizedStatus) && hasFutureAccess;
      if (isProtectedActiveEnrollment && seedEnrollment.course_order_id !== canonicalPaidOrderId) {
        return { error: "ENROLLMENT_ACTIVE_DUPLICATE" };
      }

      console.info("[payments/reconcile] enrollment_row_found", {
        event: "enrollment_row_found",
        orderId: canonicalPaidOrderId,
        enrollmentId: seedEnrollment.id,
        enrollmentCourseOrderId: seedEnrollment.course_order_id,
        enrollmentStatus: seedEnrollment.enrollment_status,
        studentId: order.student_id,
        courseId: order.course_id,
        source,
      });

      const { error: updateEnrollmentError } = await withEnrollmentStatusFallback(
        async (enrollmentStatus) =>
          await supabase
            .from("course_enrollments")
            .update({
              ...buildEnrollmentPayload(enrollmentStatus),
              cancelled_at: null,
              completed_at: null,
            })
            .eq("id", seedEnrollment.id),
        
      );

      if (updateEnrollmentError) {
        console.error("[payments/reconcile] enrollment_upsert_failed", {
          event: "enrollment_upsert_failed",
          operation: "update",
          orderId: canonicalPaidOrderId,
          course_order_id: canonicalPaidOrderId,
          razorpayOrderId,
          razorpayPaymentId,
          enrollmentId: seedEnrollment.id,
          error: updateEnrollmentError.message,
          source,
        });
        return { error: updateEnrollmentError.message };
      }

      console.info("[payments/reconcile] enrollment_row_updated", {
        event: "enrollment_row_updated",
        orderId: canonicalPaidOrderId,
        course_order_id: canonicalPaidOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        enrollmentId: seedEnrollment.id,
        source,
      });

      return { error: null };
    }

    const { error: insertEnrollmentError } = await withEnrollmentStatusFallback(
      async (enrollmentStatus) => await supabase.from("course_enrollments").insert(buildEnrollmentPayload(enrollmentStatus)),
      
    );

    if (!insertEnrollmentError) {
      console.info("[payments/reconcile] enrollment_row_created", {
        event: "enrollment_row_created",
        orderId: canonicalPaidOrderId,
        course_order_id: canonicalPaidOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        source,
      });
      return { error: null };
    }

    if (!isUniqueViolation(insertEnrollmentError)) {
      console.error("[payments/reconcile] enrollment_upsert_failed", {
        event: "enrollment_upsert_failed",
        operation: "insert",
        orderId: canonicalPaidOrderId,
        course_order_id: canonicalPaidOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        error: insertEnrollmentError.message,
        source,
      });
      return { error: insertEnrollmentError.message };
    }

    const { data: conflictingEnrollment } = await findEnrollmentByStudentCourse();

    if (!conflictingEnrollment) {
      console.error("[payments/reconcile] enrollment_upsert_failed", {
        event: "enrollment_upsert_failed",
        operation: "insert_conflict_missing_row",
        orderId: canonicalPaidOrderId,
        course_order_id: canonicalPaidOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        error: insertEnrollmentError.message,
        source,
      });
      return { error: insertEnrollmentError.message };
    }

    console.info("[payments/reconcile] enrollment_row_found", {
      event: "enrollment_row_found",
      orderId: canonicalPaidOrderId,
      enrollmentId: conflictingEnrollment.id,
      enrollmentCourseOrderId: conflictingEnrollment.course_order_id,
      enrollmentStatus: conflictingEnrollment.enrollment_status,
      studentId: order.student_id,
      courseId: order.course_id,
      source,
    });

    const { error: fallbackUpdateError } = await withEnrollmentStatusFallback(
      async (enrollmentStatus) =>
        await supabase
          .from("course_enrollments")
          .update(buildEnrollmentPayload(enrollmentStatus))
          .eq("id", conflictingEnrollment.id),
      
    );

    if (fallbackUpdateError) {
      console.error("[payments/reconcile] enrollment_upsert_failed", {
        event: "enrollment_upsert_failed",
        operation: "insert_conflict_update",
        orderId: canonicalPaidOrderId,
        course_order_id: canonicalPaidOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        enrollmentId: conflictingEnrollment.id,
        error: fallbackUpdateError.message,
        source,
      });
      return { error: fallbackUpdateError.message };
    }

    console.info("[payments/reconcile] enrollment_row_updated", {
      event: "enrollment_row_updated",
      orderId: canonicalPaidOrderId,
      course_order_id: canonicalPaidOrderId,
      razorpayOrderId,
      razorpayPaymentId,
      enrollmentId: conflictingEnrollment.id,
      source,
    });

    return { error: null };
  };

  const enrollmentMutation = await reconcileEnrollmentRow(existingEnrollment ?? null);
  if (enrollmentMutation.error) return enrollmentMutation;

  const { data: convergedEnrollment, error: convergedEnrollmentError } = await findEnrollmentByStudentCourse();
  if (convergedEnrollmentError || !convergedEnrollment) {
    const errorMessage = convergedEnrollmentError?.message ?? "Enrollment convergence failed: paid order has no enrollment row.";
    console.error("[payments/reconcile] enrollment_convergence_failed", {
      event: "enrollment_convergence_failed",
      orderId: canonicalPaidOrderId,
      course_order_id: canonicalPaidOrderId,
      razorpayOrderId,
      razorpayPaymentId,
      error: errorMessage,
      source,
    });
    return { error: errorMessage };
  }

  const payoutCreation = await createInstitutePayoutForCourseOrder({
    supabase,
    orderId: canonicalPaidOrderId,
    source,
  });
  if (payoutCreation.error) return payoutCreation;

  const [{ data: course }, { data: student }, { data: institute }, { data: admins }] = await Promise.all([
    supabase.from("courses").select("title").eq("id", order.course_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name,email,phone").eq("id", order.student_id).maybeSingle(),
    supabase.from("institutes").select("id,user_id,name,phone").eq("id", order.institute_id).maybeSingle(),
    supabase.from("profiles").select("id").in("role", ["admin"]),
  ]);

  const instituteProfile = institute?.user_id
    ? await supabase.from("profiles").select("email").eq("id", institute.user_id).maybeSingle()
    : { data: null };

  if (course && student && institute?.user_id) {
    await notifyCoursePurchase({
      orderId: order.id,
      paymentId: razorpayPaymentId,
      courseTitle: course.title ?? "Course",
      amount: order.gross_amount,
      currency: order.currency,
      student: {
        id: student.id,
        name: student.full_name ?? student.email ?? "Student",
        email: student.email,
        phone: student.phone,
      },
      institute: {
        userId: institute.user_id,
        instituteId: institute.id,
        name: institute.name ?? "Institute",
        email: instituteProfile.data?.email ?? null,
        phone: institute.phone ?? null,
      },
      adminUserIds: (admins ?? []).map((item) => item.id),
    }).catch(async (error: unknown) => {
      await writeAdminAuditLog({
        adminUserId: null,
        action: "COURSE_ENROLLMENT_NOTIFICATIONS_FAILED",
        targetTable: "course_orders",
        targetId: order.id,
        metadata: {
          source,
          error: error instanceof Error ? error.message : "Unknown notification error",
        },
      });
    });
  }

  console.info("[payments/reconcile] reconcileCourseOrderPaid:completed", {
    orderId: canonicalPaidOrderId,
    course_order_id: canonicalPaidOrderId,
    razorpayOrderId,
    razorpayPaymentId,
    payment_id: razorpayPaymentId,
    final_decision: "paid_reconciled",
    event: "reconciliation_completed",
    source,
  });

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_COURSE",
    targetTable: "course_orders",
    targetId: order.id,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
  });

  return { error: null };
}

export async function reconcilePsychometricOrderPaid({
  supabase,
  order,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  source,
  adminUserId,
}: {
  supabase: SupabaseClient;
  order: {
    id: string;
    user_id: string;
    test_id: string;
    final_amount?: number | null;
    final_paid_amount?: number | null;
    currency: string;
    payment_status: string;
    coupon_id?: string | null;
  };
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "verify_api" | "webhook";
  adminUserId?: string;
}) {
  const now = new Date().toISOString();
  console.info("[payments/reconcile] reconcilePsychometricOrderPaid:start", {
    orderId: order.id,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  });

  const canonicalPaidOrderId = order.id;

  const shouldCountCouponUsage = order.payment_status !== "paid";

  if (shouldCountCouponUsage) {
    const { error: updateError } = await supabase
      .from("psychometric_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: now,
        updated_at: now,
      })
      .eq("id", order.id)
      .in("payment_status", ["created", "failed"]);

    if (updateError) {
      console.error("[payments/reconcile] reconciliation_failed", {
        event: "reconciliation_failed",
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId,
        source,
        error: updateError.message,
      });
      return { error: updateError.message };
    }
  } else if (order.payment_status === "paid") {
    console.info("[payments/reconcile] reconciliation_skipped_already_finalized", {
      event: "reconciliation_skipped_already_finalized",
      orderId: order.id,
      userId: order.user_id,
      testId: order.test_id,
      source,
    });
  }

  const paidAmount = Number(order.final_amount ?? order.final_paid_amount ?? 0);

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_type: "psychometric",
      order_id: canonicalPaidOrderId,
      order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.psychometric,
      psychometric_order_id: canonicalPaidOrderId,
      user_id: order.user_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: paidAmount,
      currency: order.currency,
      status: "captured",
      payload: { source },
      verified: true,
      verified_at: now,
      gateway_response: { source },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) {
    console.error("[payments/reconcile] reconciliation_failed", {
      event: "reconciliation_failed",
      orderId: canonicalPaidOrderId,
      razorpayOrderId,
      razorpayPaymentId,
      source,
      error: txnError.message,
    });
    return { error: txnError.message };
  }

  if (shouldCountCouponUsage && order.coupon_id) {
    const { data: couponRow, error: couponFetchError } = await supabase
      .from("coupons")
      .select("id,max_uses,used_count")
      .eq("id", order.coupon_id)
      .maybeSingle<{ id: string; max_uses: number | null; used_count: number }>();

    if (couponFetchError) return { error: couponFetchError.message };

    if (couponRow) {
      const currentUsedCount = Number(couponRow.used_count ?? 0);
      const maxUses = couponRow.max_uses;
      if (maxUses === null || currentUsedCount < maxUses) {
        const { error: couponUpdateError } = await supabase
          .from("coupons")
          .update({ used_count: currentUsedCount + 1 })
          .eq("id", couponRow.id)
          .eq("used_count", currentUsedCount);
        if (couponUpdateError) return { error: couponUpdateError.message };
      }
    }
  }

  const finalized = await finalizePaidPsychometricOrder({ supabase, psychometricOrderId: canonicalPaidOrderId, source });
  if (finalized.error) return { error: finalized.error };

  const { data: convergedAttempt, error: convergedAttemptError } = await supabase
    .from("test_attempts")
    .select("id,status")
    .eq("id", finalized.attemptId)
    .limit(1)
    .maybeSingle<{ id: string; status: string | null }>();

  if (convergedAttemptError || !convergedAttempt) {
    const errorMessage = convergedAttemptError?.message ?? "Psychometric entitlement convergence failed: unlocked test_attempt row missing.";
    console.error("[payments/reconcile] reconciliation_failed", {
      event: "reconciliation_failed",
      orderId: canonicalPaidOrderId,
      razorpayOrderId,
      razorpayPaymentId,
      source,
      error: errorMessage,
    });
    return { error: errorMessage };
  }


  await createAccountNotification({
    userId: order.user_id,
    type: "payment",
    category: "psychometric_order",
    priority: "high",
    title: "Psychometric purchase confirmed",
    message: `Your psychometric test purchase is successful. Order ID: ${canonicalPaidOrderId}.`,
    targetUrl: "/student/purchases",
    actionLabel: "View purchase",
    entityType: "psychometric_order",
    entityId: canonicalPaidOrderId,
    dedupeKey: `psychometric-order-paid:${canonicalPaidOrderId}`,
    metadata: { orderId: canonicalPaidOrderId, paymentId: razorpayPaymentId, source },
  }).catch(() => undefined);

  console.info("[payments/reconcile] reconciliation_completed", {
    event: "reconciliation_completed",
    orderId: canonicalPaidOrderId,
    razorpayOrderId,
    razorpayPaymentId,
    payment_id: razorpayPaymentId,
    final_decision: "paid_reconciled",
    source,
  });

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_PSYCHOMETRIC",
    targetTable: "psychometric_orders",
    targetId: canonicalPaidOrderId,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
  });

  return { error: null };
}

export async function reconcileWebinarOrderPaid({
  supabase,
  order,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  source,
  paymentEventType,
  adminUserId,
}: {
  supabase: SupabaseClient;
  order: {
    id: string;
    webinar_id: string;
    student_id: string;
    institute_id: string;
    amount: number;
    currency: string;
    payment_status: string;
    order_status: string;
    access_status: string;
  };
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "verify_api" | "webhook";
  paymentEventType?: string;
  adminUserId?: string;
}) {
  const { data: webinar, error: webinarError } = await supabase
    .from("webinars")
    .select("id,title,institute_id,webinar_mode,price,currency,starts_at,ends_at")
    .eq("id", order.webinar_id)
    .maybeSingle<{
      id: string;
      title: string;
      institute_id: string;
      webinar_mode: string;
      price: number;
      currency: string;
      starts_at: string | null;
      ends_at: string | null;
    }>();

  if (webinarError) return { error: webinarError.message };
  if (!webinar) return { error: "Webinar not found for webinar order" };
  if (webinar.webinar_mode !== "paid") return { error: "Cannot reconcile payment for free webinar" };

  const { data: commissionSetting, error: commissionError } = await supabase
    .from("webinar_commission_settings")
    .select("commission_percent")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ commission_percent: number }>();

  if (commissionError) return { error: commissionError.message };

  const commissionPercent = sanitizeCommissionPercentage(commissionSetting?.commission_percent);
  if (commissionPercent === null) return { error: "Webinar commission is not configured" };

  const grossAmount = Number(Number(order.amount ?? webinar.price ?? 0).toFixed(2));
  const commission = calculateCommission(grossAmount, commissionPercent);
  const now = new Date().toISOString();
  let canonicalPaidOrderId = order.id;

  const { data: existingPaidOrder } = await supabase
    .from("webinar_orders")
    .select("id,payment_status,paid_at,razorpay_payment_id")
    .eq("student_id", order.student_id)
    .eq("webinar_id", order.webinar_id)
    .eq("payment_status", "paid")
    .limit(1)
    .maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; razorpay_payment_id: string | null }>();

  if (existingPaidOrder) {
    canonicalPaidOrderId = existingPaidOrder.id;
    console.info("[payments/reconcile] already_paid_order_found", {
      event: "already_paid_order_found",
      orderId: order.id,
      existingPaidOrderId: existingPaidOrder.id,
      studentId: order.student_id,
      webinarId: order.webinar_id,
      source,
    });
  }

  if (canonicalPaidOrderId === order.id && (order.payment_status !== "paid" || order.order_status !== "confirmed" || order.access_status !== "granted")) {
    const { error: updateError } = await supabase
      .from("webinar_orders")
      .update({
        payment_status: "paid",
        order_status: "confirmed",
        access_status: "granted",
        amount: commission.grossAmount,
        currency: webinar.currency || order.currency || "INR",
        platform_fee_percent: commission.commissionPercentage,
        platform_fee_amount: commission.commissionAmount,
        payout_amount: commission.instituteReceivable,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: now,
        updated_at: now,
      })
      .eq("id", order.id)
      .in("payment_status", ["pending", "failed", "paid"])
      .neq("order_status", "cancelled");

    if (updateError) {
      if (isUniqueViolation(updateError)) {
        const { data: paidOrderAfterConflict } = await supabase
          .from("webinar_orders")
          .select("id,payment_status,paid_at,razorpay_payment_id")
          .eq("student_id", order.student_id)
          .eq("webinar_id", order.webinar_id)
          .eq("payment_status", "paid")
          .limit(1)
          .maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; razorpay_payment_id: string | null }>();

        if (paidOrderAfterConflict) {
          canonicalPaidOrderId = paidOrderAfterConflict.id;
          console.info("[payments/reconcile] duplicate_paid_order_treated_as_success", {
            event: "duplicate_paid_order_treated_as_success",
            orderId: order.id,
            existingPaidOrderId: paidOrderAfterConflict.id,
            studentId: order.student_id,
            webinarId: order.webinar_id,
            source,
          });
        } else {
          return { error: updateError.message };
        }
      } else {
        return { error: updateError.message };
      }
    }
    const consumed = await consumeCouponUsageByCode({
      supabase,
      couponCode: (order as { metadata?: { coupon_code?: string | null } }).metadata?.coupon_code,
    });
    if (consumed.error) return consumed;
  } else if (order.payment_status === "paid") {
    console.info("[payments/reconcile] reconciliation_skipped_already_finalized", {
      event: "reconciliation_skipped_already_finalized",
      orderId: order.id,
      studentId: order.student_id,
      webinarId: order.webinar_id,
      source,
    });

    const { error: paidBackfillError } = await supabase
      .from("webinar_orders")
      .update({
        order_status: "confirmed",
        access_status: "granted",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: now,
        updated_at: now,
      })
      .eq("id", order.id)
      .neq("order_status", "cancelled");

    if (paidBackfillError) {
      console.warn("[payments/reconcile] paid_order_backfill_failed", {
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId,
        source,
        error: paidBackfillError.message,
      });
    }
  }

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_type: "webinar",
      order_id: canonicalPaidOrderId,
      order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.webinar,
      webinar_order_id: canonicalPaidOrderId,
      user_id: order.student_id,
      institute_id: order.institute_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? paymentEventType ?? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: commission.grossAmount,
      currency: webinar.currency || order.currency || "INR",
      status: "captured",
      payload: { source, paymentEventType: paymentEventType ?? null },
      verified: true,
      verified_at: now,
      gateway_response: { source, paymentEventType: paymentEventType ?? null },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) {
    const migrationHint = getOrderKindConstraintMigrationHint(txnError);
    return { error: migrationHint ?? txnError.message };
  }

  const { data: existingRegistration } = await supabase
    .from("webinar_registrations")
    .select("id,webinar_order_id,access_status,payment_status")
    .eq("webinar_id", order.webinar_id)
    .eq("student_id", order.student_id)
    .limit(1)
    .maybeSingle<{ id: string; webinar_order_id: string | null; access_status: string | null; payment_status: string | null }>();

  if (existingRegistration) {
    console.info("[payments/reconcile] entitlement_row_found", {
      event: "entitlement_row_found",
      orderId: canonicalPaidOrderId,
      entitlementId: existingRegistration.id,
      studentId: order.student_id,
      webinarId: order.webinar_id,
      source,
    });
  }

  const { error: registrationError } = await supabase.from("webinar_registrations").upsert(
    {
      webinar_id: order.webinar_id,
      institute_id: order.institute_id,
      student_id: order.student_id,
      webinar_order_id: canonicalPaidOrderId,
      registration_status: "registered",
      payment_status: "paid",
      access_status: "granted",
      registered_at: now,
      access_granted_at: now,
      access_start_at: webinar.starts_at ?? now,
      access_end_at: webinar.ends_at ?? null,
      updated_at: now,
      metadata: { source, reconciled: true, paymentEventType: paymentEventType ?? null },
    },
    { onConflict: "webinar_id,student_id" }
  );

  if (registrationError) {
    console.error("[payments/reconcile] webinar_registration_upsert_failed", {
      event: "webinar_registration_upsert_failed",
      orderId: canonicalPaidOrderId,
      webinarId: order.webinar_id,
      studentId: order.student_id,
      source,
      error: registrationError.message,
    });
    return { error: registrationError.message };
  }

  console.info("[payments/reconcile] entitlement_row_updated", {
    event: existingRegistration ? "entitlement_row_updated" : "entitlement_row_created",
    orderId: canonicalPaidOrderId,
    studentId: order.student_id,
    webinarId: order.webinar_id,
    source,
  });

  const { data: convergedRegistration } = await supabase
    .from("webinar_registrations")
    .select("id,access_status,payment_status")
    .eq("webinar_id", order.webinar_id)
    .eq("student_id", order.student_id)
    .eq("access_status", "granted")
    .in("payment_status", ["paid", "not_required"])
    .limit(1)
    .maybeSingle<{ id: string; access_status: string; payment_status: string }>();

  if (!convergedRegistration) {
    const errorMessage = "Webinar entitlement convergence failed: granted registration row missing.";
    console.error("[payments/reconcile] webinar_registration_convergence_failed", {
      event: "webinar_registration_convergence_failed",
      orderId: canonicalPaidOrderId,
      webinarId: order.webinar_id,
      studentId: order.student_id,
      source,
      error: errorMessage,
    });
    return { error: errorMessage };
  }
  console.info("[payments/reconcile] webinar_registration_updated", {
    event: existingRegistration ? "webinar_registration_updated" : "webinar_registration_created",
    registrationId: convergedRegistration.id,
    orderId: canonicalPaidOrderId,
    studentId: order.student_id,
    webinarId: order.webinar_id,
    source,
  });

  const webinarPayoutCreation = await createInstitutePayoutForWebinarOrder({
    supabase,
    orderId: canonicalPaidOrderId,
    source,
  });
  if (webinarPayoutCreation.error) return webinarPayoutCreation;

  await notifyWebinarEnrollment({
    supabase,
    webinarId: webinar.id,
    webinarTitle: webinar.title,
    studentId: order.student_id,
    instituteId: webinar.institute_id,
    mode: "paid",
  }).catch(() => undefined);

  await deliverWebinarAccess({
    supabase,
    registrationId: convergedRegistration.id,
    webinarId: webinar.id,
    studentId: order.student_id,
  }).catch((deliveryError) => {
    console.error("[payments/reconcile] webinar_delivery_failed_non_blocking", {
      event: "webinar_delivery_failed_non_blocking",
      registrationId: convergedRegistration.id,
      orderId: canonicalPaidOrderId,
      studentId: order.student_id,
      webinarId: order.webinar_id,
      source,
      error: deliveryError instanceof Error ? deliveryError.message : "Unknown error",
    });
  });

  console.info("[payments/reconcile] reconcileWebinarOrderPaid:completed", {
    orderId: canonicalPaidOrderId,
    razorpayOrderId,
    razorpayPaymentId,
    payment_id: razorpayPaymentId,
    final_decision: "paid_reconciled",
    source,
  });

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_WEBINAR",
    targetTable: "webinar_orders",
    targetId: canonicalPaidOrderId,
    metadata: { razorpayOrderId, razorpayPaymentId, source, commissionPercent, grossAmount },
  });

  return { error: null };
}
