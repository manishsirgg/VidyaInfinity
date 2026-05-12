import { normalizePaymentStatus } from "@/lib/payments/payment-status";
import { reconcileCourseOrderPaid, reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { recordActivityIfMissing, safeRunCrmAutomation, upsertInstituteCrmContactFromLead } from "@/lib/institute/crm-automation";
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
    .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status")
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

  await safeRunCrmAutomation("course_conversion", async () => {
    const [{ data: profile }, { data: enrollment }] = await Promise.all([
      supabase.from("profiles").select("full_name,email,phone").eq("id", order.student_id).maybeSingle<{ full_name: string | null; email: string | null; phone: string | null }>(),
      supabase.from("course_enrollments").select("id").eq("course_order_id", order.id).limit(1).maybeSingle<{ id: string }>(),
    ]);
    const contact = await upsertInstituteCrmContactFromLead(supabase, {
      instituteId: order.institute_id,
      fullName: profile?.full_name ?? "Student",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      serviceType: "course",
      source: "course_payment",
      lifecycleStage: "converted",
      forceStage: true,
      studentId: order.student_id,
      courseId: order.course_id,
      metadata: {
        course_order_id: order.id,
        enrollment_id: enrollment?.id ?? null,
        payment_status: "paid",
        automation_source: "payments/finalize-course",
      },
    });
    if (!contact?.id) return;
    await supabase.from("crm_contacts").update({ converted: true, converted_at: new Date().toISOString(), last_course_order_id: order.id }).eq("id", contact.id);
    await recordActivityIfMissing(supabase, {
      contactId: contact.id, instituteId: order.institute_id, actorUserId: order.student_id, activityType: "course_purchased", title: "Course purchased", dedupeKey: `course_order:${order.id}`,
      metadata: { course_order_id: order.id, enrollment_id: enrollment?.id ?? null, payment_status: "paid", gross_amount: order.gross_amount, razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId },
    });
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
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status")
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

  await safeRunCrmAutomation("webinar_conversion", async () => {
    const [{ data: profile }, { data: registration }] = await Promise.all([
      supabase.from("profiles").select("full_name,email,phone").eq("id", order.student_id).maybeSingle<{ full_name: string | null; email: string | null; phone: string | null }>(),
      supabase.from("webinar_registrations").select("id,payment_status,access_status").eq("webinar_order_id", order.id).limit(1).maybeSingle<{ id: string; payment_status: string | null; access_status: string | null }>(),
    ]);
    const contact = await upsertInstituteCrmContactFromLead(supabase, {
      instituteId: order.institute_id, fullName: profile?.full_name ?? "Student", email: profile?.email ?? null, phone: profile?.phone ?? null, serviceType: "webinar", source: "webinar_payment",
      lifecycleStage: "converted", forceStage: true, studentId: order.student_id, webinarId: order.webinar_id,
      metadata: { webinar_order_id: order.id, registration_id: registration?.id ?? null, payment_status: "paid", access_status: registration?.access_status ?? order.access_status, automation_source: "payments/finalize-webinar" },
    });
    if (!contact?.id) return;
    await supabase.from("crm_contacts").update({ converted: true, converted_at: new Date().toISOString(), last_webinar_order_id: order.id }).eq("id", contact.id);
    await recordActivityIfMissing(supabase, {
      contactId: contact.id, instituteId: order.institute_id, actorUserId: order.student_id, activityType: "webinar_purchased", title: "Webinar purchased", dedupeKey: `webinar_order:${order.id}`,
      metadata: { webinar_order_id: order.id, registration_id: registration?.id ?? null, payment_status: registration?.payment_status ?? "paid", access_status: registration?.access_status ?? order.access_status, razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId },
    });
  });

  return { error: null as string | null, finalized: true, reason: "finalized" as const, order };
}
