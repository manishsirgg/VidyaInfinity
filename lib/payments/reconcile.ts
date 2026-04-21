import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { notifyCoursePurchase } from "@/lib/marketplace/course-notifications";
import { notifyWebinarEnrollment } from "@/lib/webinars/enrollment-notifications";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

const COURSE_ENROLLMENT_ACTIVE_STATUSES = ["pending", "active", "suspended", "completed"] as const;

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
  };
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "verify_api" | "webhook";
  adminUserId?: string;
  gatewayResponse?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  console.info("[payments/reconcile/course] start", {
    orderId: order.id,
    source,
    razorpayOrderId,
    razorpayPaymentId,
    paymentStatus: order.payment_status,
  });

  const { data: existingTransaction } = await supabase
    .from("razorpay_transactions")
    .select("id,verified")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .maybeSingle<{ id: string; verified: boolean | null }>();

  const shouldSendNotifications = order.payment_status !== "paid" || !existingTransaction;

  const { data: existingEnrollment } = await supabase
    .from("course_enrollments")
    .select("id")
    .eq("student_id", order.student_id)
    .eq("course_id", order.course_id)
    .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
    .maybeSingle();

  if (order.payment_status !== "paid") {
    const { error: updateError } = await supabase
      .from("course_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: now,
      })
      .eq("id", order.id)
      .in("payment_status", ["created", "failed"]);

    if (updateError) return { error: updateError.message };
  }

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_kind: "course_enrollment",
      course_order_id: order.id,
      user_id: order.student_id,
      institute_id: order.institute_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: order.gross_amount,
      currency: order.currency,
      verified: true,
      verified_at: now,
      gateway_response: { source, ...(gatewayResponse ?? {}) },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) return { error: txnError.message };

  if (existingEnrollment) {
    const { error: updateEnrollmentError } = await supabase
      .from("course_enrollments")
      .update({
        course_order_id: order.id,
        access_start_at: now,
        metadata: { source, reconciled: true },
      })
      .eq("id", existingEnrollment.id);
    if (updateEnrollmentError) return { error: updateEnrollmentError.message };
  }

  if (!existingEnrollment) {
    const { error: enrollError } = await supabase.from("course_enrollments").upsert(
      {
        course_order_id: order.id,
        student_id: order.student_id,
        course_id: order.course_id,
        institute_id: order.institute_id,
        enrollment_status: "active",
        enrolled_at: now,
        access_start_at: now,
        metadata: { source },
      },
      { onConflict: "course_order_id" }
    );

    if (enrollError) return { error: enrollError.message };
  }

  const { data: existingPayout } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("course_order_id", order.id)
    .maybeSingle();

  if (!existingPayout) {
    const { error: payoutError } = await supabase.from("institute_payouts").insert({
      institute_id: order.institute_id,
      course_order_id: order.id,
      gross_amount: order.gross_amount,
      platform_fee_amount: order.gross_amount - order.institute_receivable_amount,
      payout_amount: order.institute_receivable_amount,
      payout_status: "pending",
      scheduled_at: now,
    });
    if (payoutError) return { error: payoutError.message };
  }

  const [{ data: course }, { data: student }, { data: institute }, { data: admins }] = await Promise.all([
    supabase.from("courses").select("title").eq("id", order.course_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name,email,phone").eq("id", order.student_id).maybeSingle(),
    supabase.from("institutes").select("id,user_id,name,phone").eq("id", order.institute_id).maybeSingle(),
    supabase.from("profiles").select("id").in("role", ["admin"]),
  ]);

  const instituteProfile = institute?.user_id
    ? await supabase.from("profiles").select("email").eq("id", institute.user_id).maybeSingle()
    : { data: null };

  if (shouldSendNotifications && course && student && institute?.user_id) {
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

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_COURSE",
    targetTable: "course_orders",
    targetId: order.id,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
  });

  console.info("[payments/reconcile/course] completed", {
    orderId: order.id,
    source,
    razorpayOrderId,
    razorpayPaymentId,
    shouldSendNotifications,
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
    final_paid_amount: number;
    currency: string;
    payment_status: string;
  };
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "verify_api" | "webhook";
  adminUserId?: string;
}) {
  if (order.payment_status !== "paid") {
    const { error: updateError } = await supabase
      .from("psychometric_orders")
      .update({
        payment_status: "paid",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .in("payment_status", ["created", "failed"]);

    if (updateError) return { error: updateError.message };
  }

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_kind: "psychometric",
      psychometric_order_id: order.id,
      user_id: order.user_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: order.final_paid_amount,
      currency: order.currency,
      verified: true,
      verified_at: new Date().toISOString(),
      gateway_response: { source },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) return { error: txnError.message };

  const { error: attemptError } = await supabase.from("test_attempts").upsert(
    {
      user_id: order.user_id,
      test_id: order.test_id,
      status: "unlocked",
      started_at: null,
    },
    { onConflict: "user_id,test_id" }
  );

  if (attemptError) return { error: attemptError.message };


  await createAccountNotification({
    userId: order.user_id,
    type: "payment",
    category: "psychometric_order",
    priority: "high",
    title: "Psychometric purchase confirmed",
    message: `Your psychometric test purchase is successful. Order ID: ${order.id}.`,
    targetUrl: "/student/purchases",
    actionLabel: "View purchase",
    entityType: "psychometric_order",
    entityId: order.id,
    dedupeKey: `psychometric-order-paid:${order.id}`,
    metadata: { orderId: order.id, paymentId: razorpayPaymentId, source },
  }).catch(() => undefined);

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_PSYCHOMETRIC",
    targetTable: "psychometric_orders",
    targetId: order.id,
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
    .select("id,title,institute_id,webinar_mode,price,currency")
    .eq("id", order.webinar_id)
    .maybeSingle<{
      id: string;
      title: string;
      institute_id: string;
      webinar_mode: string;
      price: number;
      currency: string;
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

  if (order.payment_status !== "paid" || order.order_status !== "confirmed" || order.access_status !== "granted") {
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

    if (updateError) return { error: updateError.message };
  }

  const { error: txnError } = await supabase.from("razorpay_transactions").upsert(
    {
      order_kind: "webinar",
      webinar_order_id: order.id,
      user_id: order.student_id,
      institute_id: order.institute_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      event_type: source === "webhook" ? paymentEventType ?? "payment.captured" : "payment.verify",
      payment_status: "paid",
      amount: commission.grossAmount,
      currency: webinar.currency || order.currency || "INR",
      verified: true,
      verified_at: now,
      gateway_response: { source, paymentEventType: paymentEventType ?? null },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) return { error: txnError.message };

  const { error: registrationError } = await supabase.from("webinar_registrations").upsert(
    {
      webinar_id: order.webinar_id,
      institute_id: order.institute_id,
      student_id: order.student_id,
      webinar_order_id: order.id,
      registration_status: "registered",
      payment_status: "paid",
      access_status: "granted",
      registered_at: now,
    },
    { onConflict: "webinar_id,student_id" }
  );

  if (registrationError) return { error: registrationError.message };

  const { data: existingPayout, error: existingPayoutError } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("webinar_order_id", order.id)
    .maybeSingle<{ id: string }>();

  if (existingPayoutError) return { error: existingPayoutError.message };

  if (existingPayout?.id) {
    const { error: payoutUpdateError } = await supabase
      .from("institute_payouts")
      .update({
        gross_amount: commission.grossAmount,
        platform_fee_amount: commission.commissionAmount,
        payout_amount: commission.instituteReceivable,
        payout_status: "pending",
        updated_at: now,
      })
      .eq("id", existingPayout.id);

    if (payoutUpdateError) return { error: payoutUpdateError.message };
  } else {
    const { error: payoutInsertError } = await supabase.from("institute_payouts").insert({
      institute_id: order.institute_id,
      webinar_order_id: order.id,
      payout_source: "webinar",
      gross_amount: commission.grossAmount,
      platform_fee_amount: commission.commissionAmount,
      payout_amount: commission.instituteReceivable,
      payout_status: "pending",
      source_reference_id: order.id,
      source_reference_type: "webinar_order",
      scheduled_at: now,
      updated_at: now,
    });

    if (payoutInsertError) return { error: payoutInsertError.message };
  }

  await notifyWebinarEnrollment({
    supabase,
    webinarId: webinar.id,
    webinarTitle: webinar.title,
    studentId: order.student_id,
    instituteId: webinar.institute_id,
    mode: "paid",
  }).catch(() => undefined);

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_WEBINAR",
    targetTable: "webinar_orders",
    targetId: order.id,
    metadata: { razorpayOrderId, razorpayPaymentId, source, commissionPercent, grossAmount },
  });

  return { error: null };
}
