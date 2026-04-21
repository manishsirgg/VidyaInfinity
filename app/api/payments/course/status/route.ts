import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildCoursePaymentRedirect, resolveCoursePollingState } from "@/lib/payments/course-payment-status";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const COURSE_ENROLLMENT_ACTIVE_STATUSES = ["pending", "active", "suspended", "completed", "enrolled"] as const;

type StatusRow = {
  id: string;
  student_id: string;
  course_id: string;
  institute_id: string;
  gross_amount: number;
  institute_receivable_amount: number;
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

  let query = admin.data
    .from("course_orders")
    .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,razorpay_order_id,razorpay_payment_id,paid_at,courses(title)")
    .eq("student_id", auth.user.id)
    .limit(1);

  if (orderId) {
    query = query.eq("razorpay_order_id", orderId);
  } else if (paymentId) {
    query = query.eq("razorpay_payment_id", paymentId);
  }

  const { data: order, error: orderError } = await query.maybeSingle<StatusRow>();

  if (orderError) {
    return NextResponse.json({ error: "Unable to fetch payment status." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Course order not found." }, { status: 404 });
  }

  const { data: enrollment } = await admin.data
    .from("course_enrollments")
    .select("id,enrollment_status")
    .eq("course_order_id", order.id)
    .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
    .maybeSingle<{ id: string; enrollment_status: string }>();

  let resolvedEnrollment = enrollment;
  let resolvedOrder = { ...order };

  const normalizedOrderStatus = String(resolvedOrder.payment_status ?? "").trim().toLowerCase();
  const hasPaidMarker = normalizedOrderStatus === "paid" || Boolean(resolvedOrder.paid_at);
  const shouldTryPassiveReconciliation = !resolvedEnrollment && Boolean(paymentId);

  if (shouldTryPassiveReconciliation && paymentId) {
    const razorpay = getRazorpayClient();

    if (hasPaidMarker) {
      const reconciled = await reconcileCourseOrderPaid({
        supabase: admin.data,
        order: {
          id: resolvedOrder.id,
          student_id: resolvedOrder.student_id,
          course_id: resolvedOrder.course_id,
          institute_id: resolvedOrder.institute_id,
          gross_amount: resolvedOrder.gross_amount,
          institute_receivable_amount: resolvedOrder.institute_receivable_amount,
          currency: resolvedOrder.currency,
          payment_status: normalizedOrderStatus || "created",
        },
        razorpayOrderId: resolvedOrder.razorpay_order_id ?? orderId ?? "",
        razorpayPaymentId: paymentId,
        source: "verify_api",
        gatewayResponse: { source: "status_poll_paid_marker" },
      });

      if (!reconciled.error) {
        const { data: refreshedEnrollment } = await admin.data
          .from("course_enrollments")
          .select("id,enrollment_status")
          .eq("course_order_id", resolvedOrder.id)
          .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
          .maybeSingle<{ id: string; enrollment_status: string }>();

        resolvedEnrollment = refreshedEnrollment ?? resolvedEnrollment;
        resolvedOrder = {
          ...resolvedOrder,
          payment_status: "paid",
          razorpay_payment_id: paymentId,
          paid_at: resolvedOrder.paid_at ?? new Date().toISOString(),
        };
      }
    } else if (razorpay.ok) {
      try {
        const payment = (await razorpay.data.payments.fetch(paymentId)) as {
          id?: string;
          order_id?: string;
          status?: string;
          amount?: number;
          currency?: string;
          method?: string;
        };

        const expectedAmountInPaise = Math.round(Number(resolvedOrder.gross_amount ?? 0) * 100);
        const paymentCaptured = String(payment.status ?? "").toLowerCase() === "captured";
        const paymentMatchesOrder =
          payment.id === paymentId &&
          payment.order_id === (resolvedOrder.razorpay_order_id ?? orderId) &&
          Number(payment.amount ?? 0) === expectedAmountInPaise &&
          String(payment.currency ?? "").toUpperCase() === String(resolvedOrder.currency ?? "").toUpperCase();

        if (paymentCaptured && paymentMatchesOrder) {
          const reconciled = await reconcileCourseOrderPaid({
            supabase: admin.data,
            order: {
              id: resolvedOrder.id,
              student_id: resolvedOrder.student_id,
              course_id: resolvedOrder.course_id,
              institute_id: resolvedOrder.institute_id,
              gross_amount: resolvedOrder.gross_amount,
              institute_receivable_amount: resolvedOrder.institute_receivable_amount,
              currency: resolvedOrder.currency,
              payment_status: resolvedOrder.payment_status ?? "created",
            },
            razorpayOrderId: resolvedOrder.razorpay_order_id ?? orderId ?? payment.order_id ?? "",
            razorpayPaymentId: paymentId,
            source: "verify_api",
            gatewayResponse: { source: "status_poll", method: payment.method ?? null },
          });

          if (!reconciled.error) {
            const { data: refreshedEnrollment } = await admin.data
              .from("course_enrollments")
              .select("id,enrollment_status")
              .eq("course_order_id", resolvedOrder.id)
              .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
              .maybeSingle<{ id: string; enrollment_status: string }>();

            resolvedEnrollment = refreshedEnrollment ?? resolvedEnrollment;
            resolvedOrder = {
              ...resolvedOrder,
              payment_status: "paid",
              razorpay_payment_id: paymentId,
              paid_at: new Date().toISOString(),
            };
          }
        }
      } catch {
        // Keep pending state and let polling continue.
      }
    }
  }

  const normalized = resolveCoursePollingState({
    paymentStatus: resolvedOrder.payment_status,
    enrolled: Boolean(resolvedEnrollment),
  });
  const redirectState = normalized === "pending" ? "pending" : normalized === "failed" ? "failed" : "success";

  return NextResponse.json({
    ok: true,
    state: normalized,
    redirectTo: buildCoursePaymentRedirect({
      state: redirectState,
      orderId: resolvedOrder.razorpay_order_id ?? orderId,
      paymentId: resolvedOrder.razorpay_payment_id,
    }),
    order: {
      id: resolvedOrder.id,
      courseId: resolvedOrder.course_id,
      courseTitle: extractCourseTitle(resolvedOrder),
      amount: resolvedOrder.gross_amount,
      currency: resolvedOrder.currency,
      paymentStatus: resolvedOrder.payment_status,
      razorpayOrderId: resolvedOrder.razorpay_order_id,
      razorpayPaymentId: resolvedOrder.razorpay_payment_id,
      paidAt: resolvedOrder.paid_at,
    },
    enrollment: resolvedEnrollment
      ? {
          id: resolvedEnrollment.id,
          status: resolvedEnrollment.enrollment_status,
        }
      : null,
  });
}
