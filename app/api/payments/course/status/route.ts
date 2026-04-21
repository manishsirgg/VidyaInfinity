import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type StudentProfileRow = {
  id: string;
  role: string | null;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function GET(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "course"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  try {
    const auth = await requireApiUser("student", { requireApproved: false });
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const orderRecordId = url.searchParams.get("order_id")?.trim() ?? "";
    const razorpayOrderId = url.searchParams.get("razorpay_order_id")?.trim() ?? "";

    if (!orderRecordId && !razorpayOrderId) {
      return NextResponse.json({ error: "order_id or razorpay_order_id is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: studentProfile } = await admin.data
      .from("profiles")
      .select("id,role")
      .eq("id", auth.user.id)
      .maybeSingle<StudentProfileRow>();

    if (!studentProfile || normalizeStatus(studentProfile.role) !== "student") {
      return NextResponse.json({ error: "Only student accounts can query payment status." }, { status: 403 });
    }

    let query = admin.data
      .from("course_orders")
      .select("id,student_id,course_id,payment_status,razorpay_order_id,razorpay_payment_id,paid_at")
      .eq("student_id", studentProfile.id)
      .limit(1);

    query = orderRecordId ? query.eq("id", orderRecordId) : query.eq("razorpay_order_id", razorpayOrderId);

    const { data: order, error: orderError } = await query.maybeSingle<{
      id: string;
      student_id: string;
      course_id: string;
      payment_status: string;
      razorpay_order_id: string | null;
      razorpay_payment_id: string | null;
      paid_at: string | null;
    }>();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found for this user." }, { status: 404 });
    }

    const { data: enrollment } = await admin.data
      .from("course_enrollments")
      .select("id,enrollment_status")
      .eq("course_order_id", order.id)
      .maybeSingle<{ id: string; enrollment_status: string }>();

    let state: "success" | "failed" | "pending" = "pending";
    let redirectUrl = `/student/payments/pending?order_id=${encodeURIComponent(order.id)}`;

    const paymentStatus = normalizeStatus(order.payment_status);
    if (paymentStatus === "paid") {
      state = "success";
      redirectUrl = `/student/payments/success?order_id=${encodeURIComponent(order.id)}`;
    } else if (paymentStatus === "failed") {
      state = "failed";
      redirectUrl = `/student/payments/failed?order_id=${encodeURIComponent(order.id)}`;
    }

    console.info("[course/status] resolved", {
      orderId: order.id,
      razorpayOrderId: order.razorpay_order_id,
      state,
      paymentStatus,
      hasEnrollment: Boolean(enrollment?.id),
    });

    return NextResponse.json({
      ok: true,
      state,
      redirectUrl,
      order: {
        id: order.id,
        razorpayOrderId: order.razorpay_order_id,
        razorpayPaymentId: order.razorpay_payment_id,
        paymentStatus: order.payment_status,
        paidAt: order.paid_at,
      },
      enrollment: {
        confirmed: Boolean(enrollment?.id),
        enrollmentId: enrollment?.id ?? null,
        status: enrollment?.enrollment_status ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch payment status." },
      { status: 500 }
    );
  }
}
