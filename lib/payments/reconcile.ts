import { writeAdminAuditLog } from "@/lib/admin/audit-log";
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
    user_id: string;
    course_id: string;
    institute_id: string;
    final_paid_amount: number;
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
      order_type: "course",
      order_id: order.id,
      user_id: order.user_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      amount: order.final_paid_amount,
      currency: order.currency,
      status: "captured",
      payload: { source },
    },
    { onConflict: "razorpay_payment_id" }
  );

  if (txnError) return { error: txnError.message };

  const { error: enrollError } = await supabase.from("course_enrollments").upsert(
    {
      user_id: order.user_id,
      course_id: order.course_id,
      institute_id: order.institute_id,
      enrollment_status: "enrolled",
      order_id: order.id,
    },
    { onConflict: "user_id,course_id" }
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
      order_type: "psychometric",
      order_id: order.id,
      user_id: order.user_id,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      amount: order.final_paid_amount,
      currency: order.currency,
      status: "captured",
      payload: { source },
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
