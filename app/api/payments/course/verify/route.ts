import { NextResponse } from "next/server";

import { calculateCommission } from "@/lib/payments/commission";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { orderId, paymentId, signature, courseId, userId } = await request.json();

  if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("id,institute_id,fee_amount")
    .eq("id", courseId)
    .single();

  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("commission_percentage")
    .eq("key", "default")
    .single();

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const commission = calculateCommission(course.fee_amount, settings?.commission_percentage ?? 12);

  const { error } = await supabaseAdmin.from("course_transactions").insert({
    user_id: userId,
    course_id: courseId,
    institute_id: course.institute_id,
    gross_amount: commission.grossAmount,
    commission_percentage: commission.commissionPercentage,
    platform_commission_amount: commission.commissionAmount,
    institute_receivable_amount: commission.instituteReceivable,
    payment_status: "successful",
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
