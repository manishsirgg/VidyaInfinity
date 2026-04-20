import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizeOrganizationType } from "@/lib/constants/organization-types";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const schemaErrorResponse = await getPaymentSchemaErrorResponse();
    if (schemaErrorResponse) return schemaErrorResponse;

    const auth = await requireApiUser("student", { requireApproved: false });
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
      .select("id,institute_id,fees,status,admission_deadline,is_active")
      .eq("id", courseId)
      .eq("status", "approved")
      .eq("is_active", true)
      .maybeSingle<{ id: string; institute_id: string; fees: number; status: string; admission_deadline: string | null; is_active: boolean }>();

    if (!course) return NextResponse.json({ error: "Invalid course" }, { status: 400 });

    if (course.admission_deadline && new Date(course.admission_deadline).getTime() < Date.now()) {
      return NextResponse.json({ error: "Admission deadline has passed for this course" }, { status: 400 });
    }

    const { data: existingPaidEnrollment } = await admin.data
      .from("course_enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .eq("enrollment_status", "enrolled")
      .maybeSingle();

    if (existingPaidEnrollment) {
      return NextResponse.json({ error: "You are already enrolled in this course" }, { status: 409 });
    }

    const { data: institute } = await admin.data
      .from("institutes")
      .select("organization_type")
      .eq("id", course.institute_id)
      .maybeSingle<{ organization_type: string | null }>();

    const normalizedOrganizationType = normalizeOrganizationType(institute?.organization_type ?? "");

    let commissionPercentage: number | null = null;

    if (normalizedOrganizationType) {
      const { data: entityCommission, error: entityCommissionError } = await admin.data
        .from("entity_commissions")
        .select("commission_percent")
        .eq("entity_type", normalizedOrganizationType)
        .eq("is_active", true)
        .maybeSingle<{ commission_percent: number }>();

      if (!entityCommissionError) {
        commissionPercentage = sanitizeCommissionPercentage(entityCommission?.commission_percent);
      }
    }

    if (commissionPercentage === null) {
      const { data: legacyCommission } = await admin.data
        .from("platform_commission_settings")
        .select("commission_percentage")
        .eq("key", "default")
        .maybeSingle<{ commission_percentage: number }>();

      commissionPercentage = sanitizeCommissionPercentage(legacyCommission?.commission_percentage) ?? 12;
    }

    const commission = calculateCommission(Number(course.fees ?? 0), commissionPercentage);

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: Math.round(commission.grossAmount * 100),
      currency: "INR",
      receipt: `course_${course.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        studentId: user.id,
        courseId: course.id,
        instituteId: course.institute_id,
      },
    });

    const { data: insertedOrder, error: orderError } = await admin.data
      .from("course_orders")
      .insert({
        student_id: user.id,
        course_id: course.id,
        institute_id: course.institute_id,
        order_kind: "course_enrollment",
        payment_status: "created",
        gross_amount: commission.grossAmount,
        commission_percent: commission.commissionPercentage,
        platform_fee_amount: commission.commissionAmount,
        institute_receivable_amount: commission.instituteReceivable,
        currency: "INR",
        razorpay_order_id: order.id,
        razorpay_receipt: order.receipt ?? null,
        metadata: { source: "course_create_order_api" },
      })
      .select("id")
      .single<{ id: string }>();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

    return NextResponse.json({ order, orderRecordId: insertedOrder.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create course order" },
      { status: 500 }
    );
  }
}
