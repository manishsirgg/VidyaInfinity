import { normalizePaymentStatus } from "@/lib/payments/payment-status";
import { reconcileCourseOrderPaid, reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { markCourseOrderConvertedInCrm, markWebinarOrderConvertedInCrm, safeRunCrmAutomation } from "@/lib/institute/crm-automation";
import { notifyReconciliationCritical } from "@/lib/notifications/admin-critical-events";
import { notificationLinks } from "@/lib/notifications/links";
import type { SupabaseClient } from "@supabase/supabase-js";

type FinalizeSource = "verify_api" | "webhook";

type CourseOrderRow = {
  id: string;
  student_id: string;
  course_id: string;
  institute_id: string;
  gross_amount: number;
  institute_receivable_amount: number;
  currency: string;
  payment_status: string;
  metadata?: { coupon_code?: string | null } | null;
};

type WebinarOrderRow = {
  id: string;
  webinar_id: string;
  student_id: string;
  institute_id: string;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  access_status: string;
  metadata?: { coupon_code?: string | null } | null;
};

function isCapturedStatus(status: string | null | undefined) {
  const normalized = normalizePaymentStatus(status);
  return normalized === "captured" || normalized === "paid";
}

export async function finalizeCoursePaymentFromRazorpay({
  supabase,
  razorpayOrderId,
  razorpayPaymentId,
  razorpayStatus,
  razorpaySignature,
  source,
  gatewayResponse,
  studentId,
}: {
  supabase: SupabaseClient;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayStatus?: string | null;
  razorpaySignature?: string;
  source: FinalizeSource;
  gatewayResponse?: Record<string, unknown>;
  studentId?: string;
}) {
  console.info("[payments/finalize-course] finalization started", {
    razorpayOrderId,
    razorpayPaymentId,
    razorpayStatus: razorpayStatus ?? null,
    source,
    studentId: studentId ?? null,
  });

  if (!isCapturedStatus(razorpayStatus ?? "captured")) {
    console.info("[payments/finalize-course] finalization skipped non-captured", {
      razorpayOrderId,
      razorpayPaymentId,
      razorpayStatus: razorpayStatus ?? null,
      source,
    });
    return { error: null as string | null, finalized: false, reason: "not_captured" as const };
  }

  let query = supabase
    .from("course_orders")
    .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,metadata")
    .eq("razorpay_order_id", razorpayOrderId)
    .limit(1);

  if (studentId) query = query.eq("student_id", studentId);

  const { data: order, error: orderError } = await query.maybeSingle<CourseOrderRow>();

  if (orderError) {
    console.error("[payments/finalize-course] local order lookup failed", { razorpayOrderId, error: orderError.message, source });
    return { error: orderError.message, finalized: false, reason: "lookup_failed" as const };
  }

  if (!order) {
    console.warn("[payments/finalize-course] local order not found", { razorpayOrderId, source, studentId: studentId ?? null });
    return { error: null as string | null, finalized: false, reason: "order_not_found" as const };
  }

  console.info("[payments/finalize-course] local order found", {
    orderId: order.id,
    paymentStatus: order.payment_status,
    razorpayOrderId,
    source,
  });

  const reconciled = await reconcileCourseOrderPaid({
    supabase,
    order,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    source,
    gatewayResponse,
  });

  if (reconciled.error) {
    await notifyReconciliationCritical({
      title: "Course payment finalization failed",
      message: "Razorpay-captured course payment could not be finalized locally.",
      category: "payment_reconciliation",
      priority: "critical",
      targetUrl: notificationLinks.adminCourseModerationUrl(),
      dedupeKey: `admin:course-verify-finalize-failed:${order.id}`,
      metadata: { routeName: `payments/finalize-course:${source}`, orderId: order.id, razorpayOrderId, razorpayPaymentId, courseId: order.course_id, studentId: order.student_id, instituteId: order.institute_id, failureReason: reconciled.error },
    });
    console.error("[payments/finalize-course] finalization failure", {
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId,
      source,
      error: reconciled.error,
    });
    return { error: reconciled.error, finalized: false, reason: "reconcile_failed" as const };
  }

  console.info("[payments/finalize-course] finalization success", {
    orderId: order.id,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  });

  await safeRunCrmAutomation("course-paid", async () => {
    const result = await markCourseOrderConvertedInCrm({
      courseOrderId: order.id, razorpayOrderId, razorpayPaymentId, source: "payments/finalize-course",
    });
    console.info("[CRM automation][course-paid] contact result", { course_order_id: order.id, contact_id: result.contactId });
  });

  return { error: null as string | null, finalized: true, reason: "finalized" as const, order };
}

export async function finalizeWebinarPaymentFromRazorpay({
  supabase,
  razorpayOrderId,
  razorpayPaymentId,
  razorpayStatus,
  razorpaySignature,
  source,
  paymentEventType,
  studentId,
}: {
  supabase: SupabaseClient;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayStatus?: string | null;
  razorpaySignature?: string;
  source: FinalizeSource;
  paymentEventType?: string;
  studentId?: string;
}) {
  console.info("[payments/finalize-webinar] finalization started", {
    razorpayOrderId,
    razorpayPaymentId,
    razorpayStatus: razorpayStatus ?? null,
    source,
    studentId: studentId ?? null,
  });

  if (!isCapturedStatus(razorpayStatus ?? "captured")) {
    console.info("[payments/finalize-webinar] finalization skipped non-captured", {
      razorpayOrderId,
      razorpayPaymentId,
      razorpayStatus: razorpayStatus ?? null,
      source,
    });
    return { error: null as string | null, finalized: false, reason: "not_captured" as const };
  }

  let query = supabase
    .from("webinar_orders")
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status,metadata")
    .eq("razorpay_order_id", razorpayOrderId)
    .limit(1);

  if (studentId) query = query.eq("student_id", studentId);

  const { data: order, error: orderError } = await query.maybeSingle<WebinarOrderRow>();

  if (orderError) {
    console.error("[payments/finalize-webinar] local order lookup failed", { razorpayOrderId, error: orderError.message, source });
    return { error: orderError.message, finalized: false, reason: "lookup_failed" as const };
  }

  if (!order) {
    console.warn("[payments/finalize-webinar] local order not found", { razorpayOrderId, source, studentId: studentId ?? null });
    return { error: null as string | null, finalized: false, reason: "order_not_found" as const };
  }

  console.info("[payments/finalize-webinar] local order found", {
    orderId: order.id,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    accessStatus: order.access_status,
    razorpayOrderId,
    source,
  });

  const reconciled = await reconcileWebinarOrderPaid({
    supabase,
    order,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    source,
    paymentEventType,
  });

  if (reconciled.error) {
    await notifyReconciliationCritical({
      title: "Webinar payment finalization failed",
      message: "Razorpay-captured webinar payment could not be finalized locally.",
      category: "payment_reconciliation",
      priority: "critical",
      targetUrl: notificationLinks.adminWebinarsUrl ? notificationLinks.adminWebinarsUrl() : notificationLinks.adminDashboardUrl(),
      dedupeKey: `admin:webinar-verify-finalize-failed:${order.id}`,
      metadata: { routeName: `payments/finalize-webinar:${source}`, orderId: order.id, razorpayOrderId, razorpayPaymentId, webinarId: order.webinar_id, studentId: order.student_id, instituteId: order.institute_id, failureReason: reconciled.error },
    });
    console.error("[payments/finalize-webinar] finalization failure", {
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId,
      source,
      error: reconciled.error,
    });
    return { error: reconciled.error, finalized: false, reason: "reconcile_failed" as const };
  }

  console.info("[payments/finalize-webinar] finalization success", {
    orderId: order.id,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  });

  await safeRunCrmAutomation("webinar-paid", async () => {
    const result = await markWebinarOrderConvertedInCrm({
      webinarOrderId: order.id, razorpayOrderId, razorpayPaymentId, source: "payments/finalize-webinar",
    });
    console.info("[CRM automation][webinar-paid] contact result", { webinar_order_id: order.id, contact_id: result.contactId });
  });

  return { error: null as string | null, finalized: true, reason: "finalized" as const, order };
}
