import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildCoursePaymentRedirect, resolveCoursePollingState } from "@/lib/payments/course-payment-status";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type StatusRow = {
  id: string;
  student_id: string;
  course_id: string;
  gross_amount: number;
  currency: string;
  payment_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  courses: { title: string | null } | { title: string | null }[] | null;
};

function extractCourseTitle(row: StatusRow) {
  if (!row.courses) return null;
  if (Array.isArray(row.courses)) return row.courses[0]?.title ?? null;
  return row.courses.title ?? null;
}

export async function GET(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "course"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id") ?? searchParams.get("razorpay_order_id");
  const paymentId = searchParams.get("payment_id") ?? searchParams.get("razorpay_payment_id");

  if (!orderId && !paymentId) {
    return NextResponse.json({ error: "order_id or payment_id is required" }, { status: 400 });
  }

  console.info("[course/status] status poll", { studentId: auth.user.id, orderId, paymentId });

  let query = admin.data
    .from("course_orders")
    .select("id,student_id,course_id,gross_amount,currency,payment_status,razorpay_order_id,razorpay_payment_id,paid_at,courses(title)")
    .eq("student_id", auth.user.id)
    .limit(1);

  if (orderId) {
    query = query.eq("razorpay_order_id", orderId);
  } else if (paymentId) {
    query = query.eq("razorpay_payment_id", paymentId);
  }

  const { data: order, error: orderError } = await query.maybeSingle<StatusRow>();

  if (orderError) {
    console.error("[course/status] order lookup failed", {
      studentId: auth.user.id,
      orderId,
      paymentId,
      error: orderError.message,
    });
    return NextResponse.json({ error: "Unable to fetch payment status." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Course order not found." }, { status: 404 });
  }

  const { data: enrollment } = await admin.data
    .from("course_enrollments")
    .select("id,enrollment_status")
    .eq("course_order_id", order.id)
    .in("enrollment_status", ["pending", "active", "suspended", "completed"])
    .maybeSingle<{ id: string; enrollment_status: string }>();

  const normalized = resolveCoursePollingState({ paymentStatus: order.payment_status, enrolled: Boolean(enrollment) });
  const redirectState = normalized === "pending" ? "pending" : normalized === "failed" ? "failed" : "success";

  console.info("[course/status] status resolved", {
    orderId: order.razorpay_order_id,
    paymentId: order.razorpay_payment_id,
    state: normalized,
  });

  return NextResponse.json({
    ok: true,
    state: normalized,
    redirectTo: buildCoursePaymentRedirect({
      state: redirectState,
      orderId: order.razorpay_order_id ?? orderId,
      paymentId: order.razorpay_payment_id,
    }),
    order: {
      id: order.id,
      courseId: order.course_id,
      courseTitle: extractCourseTitle(order),
      amount: order.gross_amount,
      currency: order.currency,
      paymentStatus: order.payment_status,
      razorpayOrderId: order.razorpay_order_id,
      razorpayPaymentId: order.razorpay_payment_id,
      paidAt: order.paid_at,
    },
    enrollment: enrollment
      ? {
          id: enrollment.id,
          status: enrollment.enrollment_status,
        }
      : null,
  });
}
