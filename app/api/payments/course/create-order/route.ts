import { NextResponse } from "next/server";

import { calculateCommission } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { razorpay } from "@/lib/payments/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse();
  if (schemaErrorResponse) return schemaErrorResponse;

  const { courseId, userId } = await request.json();

  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("id,institute_id,fee_amount,approval_status")
    .eq("id", courseId)
    .eq("approval_status", "approved")
    .single();

  if (!course) return NextResponse.json({ error: "Invalid course" }, { status: 400 });

  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("commission_percentage")
    .eq("key", "default")
    .single();

  const commission = calculateCommission(course.fee_amount, settings?.commission_percentage ?? 12);

  const order = await razorpay.orders.create({
    amount: Math.round(course.fee_amount * 100),
    currency: "INR",
    notes: {
      courseId,
      userId,
      instituteId: course.institute_id,
      commissionPercentage: String(commission.commissionPercentage),
    },
  });

  return NextResponse.json({ order, commission });
}
