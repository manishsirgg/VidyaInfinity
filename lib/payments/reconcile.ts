import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { notifyCoursePurchase } from "@/lib/marketplace/course-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function reconcileCourseOrderPaid({
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
}) {
  if (order.payment_status !== "paid") {
    const { error: updateError } = await supabase
      .from("course_orders")
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
      verified_at: new Date().toISOString(),
      gateway_response: { source },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) return { error: txnError.message };

  const { error: enrollError } = await supabase.from("course_enrollments").upsert(
    {
      course_order_id: order.id,
      student_id: order.student_id,
      course_id: order.course_id,
      institute_id: order.institute_id,
      enrollment_status: "enrolled",
      enrolled_at: new Date().toISOString(),
      access_start_at: new Date().toISOString(),
      metadata: { source },
    },
    { onConflict: "course_order_id" }
  );

  if (enrollError) return { error: enrollError.message };

  const { data: existingPayout } = await supabase
    .from("institute_payouts")
    .select("id")
    .eq("course_order_id", order.id)
    .maybeSingle();

  if (!existingPayout) {
    const { error: payoutError } = await supabase.from("institute_payouts").insert({
      institute_id: order.institute_id,
      course_order_id: order.id,
      amount_payable: order.institute_receivable_amount,
      payout_status: "pending",
      due_at: new Date().toISOString(),
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

  await writeAdminAuditLog({
    adminUserId: adminUserId ?? null,
    action: "PAYMENT_RECONCILED_PSYCHOMETRIC",
    targetTable: "psychometric_orders",
    targetId: order.id,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
  });

  return { error: null };
}
