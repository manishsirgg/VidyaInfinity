import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { calculateCommission } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse();
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student");
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { courseId } = await request.json();

    if (!courseId) {
      return NextResponse.json({ error: "courseId is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: course } = await admin.data
      .from("courses")
      .select("id,institute_id,fee_amount,approval_status,admission_deadline")
      .eq("id", courseId)
      .eq("approval_status", "approved")
      .single();

    if (!course) return NextResponse.json({ error: "Invalid course" }, { status: 400 });

    if (course.admission_deadline && new Date(course.admission_deadline).getTime() < Date.now()) {
      return NextResponse.json({ error: "Admission deadline has passed for this course" }, { status: 400 });
    }

    const { data: existingPaidEnrollment } = await admin.data
      .from("course_enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", course.id)
      .eq("enrollment_status", "enrolled")
      .maybeSingle();

    if (existingPaidEnrollment) {
      return NextResponse.json({ error: "You are already enrolled in this course" }, { status: 409 });
    }

    const { data: settings } = await admin.data
      .from("platform_commission_settings")
      .select("commission_percentage")
      .eq("key", "default")
      .maybeSingle();

    const commission = calculateCommission(course.fee_amount, Number(settings?.commission_percentage ?? 12));

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: Math.round(commission.grossAmount * 100),
      currency: "INR",
      notes: {
        userId: user.id,
        courseId: course.id,
        instituteId: course.institute_id,
      },
    });

    const { error: orderError } = await admin.data.from("course_orders").insert({
      user_id: user.id,
      course_id: course.id,
      institute_id: course.institute_id,
      payment_status: "created",
      gross_amount: commission.grossAmount,
      commission_percentage: commission.commissionPercentage,
      platform_commission_amount: commission.commissionAmount,
      institute_receivable_amount: commission.instituteReceivable,
      final_paid_amount: commission.grossAmount,
      currency: "INR",
      razorpay_order_id: order.id,
      metadata: { source: "course_create_order_api" },
    });

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

    return NextResponse.json({ order, orderId: order.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create course order" },
      { status: 500 }
    );
  }
}
