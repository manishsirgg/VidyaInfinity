import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildCoursePaymentRedirect, resolveCoursePollingState } from "@/lib/payments/course-payment-status";
import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const COURSE_ENROLLMENT_ACTIVE_STATUSES = ["enrolled", "pending", "active", "suspended", "completed"] as const;

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
};
type EnrollmentStatusRow = {
  id: string;
  enrollment_status: string;
  course_order_id: string | null;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function toErrorMessage(error: unknown) {
  if (!error) return null;
  if (typeof error === "object" && error && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return String(error);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id") ?? searchParams.get("razorpay_order_id");
  const paymentId = searchParams.get("payment_id") ?? searchParams.get("razorpay_payment_id");

  const logCtx = { order_id: orderId ?? null, razorpay_order_id: orderId ?? null, payment_id: paymentId ?? null };
  console.info("[course/status] entry", logCtx);

  const schema = await detectPaymentSchemaMismatches(["common", "course"]);
  if (schema.envError || schema.missing.length || schema.missingColumns.length) {
    console.error("[course/status] schema mismatch detected", {
      ...logCtx,
      envError: schema.envError,
      missingTables: schema.missing,
      missingColumns: schema.missingColumns,
    });
  }

  try {
    const auth = await requireApiUser("student", { requireApproved: false });
    if ("error" in auth) return auth.error;

    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, state: "pending", error: admin.error, code: "ADMIN_CLIENT_UNAVAILABLE" }, { status: 503 });
    }

    if (!orderId && !paymentId) {
      return NextResponse.json({ ok: false, error: "order_id or payment_id is required", code: "MISSING_IDENTIFIERS" }, { status: 400 });
    }

    let query = admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,razorpay_order_id,razorpay_payment_id,paid_at")
      .eq("student_id", auth.user.id)
      .limit(1);

    if (orderId) query = query.eq("razorpay_order_id", orderId);
    else if (paymentId) query = query.eq("razorpay_payment_id", paymentId);

    const { data: order, error: orderError } = await query.maybeSingle<StatusRow>();
    if (orderError) {
      console.error("[course/status] order lookup failed", { ...logCtx, error: orderError.message });
      return NextResponse.json({ ok: false, state: "pending", error: "Unable to fetch payment status.", code: "ORDER_LOOKUP_FAILED" }, { status: 503 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Course order not found.", code: "ORDER_NOT_FOUND" }, { status: 404 });
    }

    const orderLogCtx = {
      ...logCtx,
      course_order_id: order.id,
      razorpay_order_id: order.razorpay_order_id ?? orderId ?? null,
      payment_id: paymentId ?? order.razorpay_payment_id ?? null,
    };

    const [{ data: enrollmentByOrderId, error: enrollmentError }, { data: transaction, error: transactionError }] = await Promise.all([
      admin.data
        .from("course_enrollments")
        .select("id,enrollment_status,course_order_id")
        .eq("course_order_id", order.id)
        .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
        .maybeSingle<EnrollmentStatusRow>(),
      admin.data
        .from("razorpay_transactions")
        .select("id")
        .eq("course_order_id", order.id)
        .eq("payment_status", "paid")
        .limit(1)
        .maybeSingle<{ id: string }>(),
    ]);

    if (enrollmentError || transactionError) {
      console.error("[course/status] dependent lookup failed", {
        ...orderLogCtx,
        enrollmentError: enrollmentError?.message ?? null,
        transactionError: transactionError?.message ?? null,
        db_error: enrollmentError?.message ?? transactionError?.message ?? null,
      });
    }

    let resolvedEnrollment = enrollmentByOrderId;
    let resolvedOrder = { ...order };

    if (!resolvedEnrollment) {
      const { data: enrollmentByStudentCourse, error: enrollmentByStudentCourseError } = await admin.data
        .from("course_enrollments")
        .select("id,enrollment_status,course_order_id")
        .eq("student_id", resolvedOrder.student_id)
        .eq("course_id", resolvedOrder.course_id)
        .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
        .limit(1)
        .maybeSingle<EnrollmentStatusRow>();

      if (enrollmentByStudentCourseError) {
        console.error("[course/status] enrollment-by-student-course lookup failed", {
          ...orderLogCtx,
          db_error: enrollmentByStudentCourseError.message,
        });
      } else if (enrollmentByStudentCourse) {
        resolvedEnrollment = enrollmentByStudentCourse;
        console.info("[course/status] existing_enrollment_found", {
          event: "existing_enrollment_found",
          ...orderLogCtx,
          enrollment_id: enrollmentByStudentCourse.id,
          enrollment_course_order_id: enrollmentByStudentCourse.course_order_id,
        });
      }
    }

    if (normalizeStatus(resolvedOrder.payment_status) !== "paid") {
      const { data: paidSiblingOrder, error: paidSiblingOrderError } = await admin.data
        .from("course_orders")
        .select("id,payment_status,paid_at,razorpay_order_id,razorpay_payment_id")
        .eq("student_id", resolvedOrder.student_id)
        .eq("course_id", resolvedOrder.course_id)
        .eq("payment_status", "paid")
        .limit(1)
        .maybeSingle<Pick<StatusRow, "id" | "payment_status" | "paid_at" | "razorpay_order_id" | "razorpay_payment_id">>();

      if (paidSiblingOrderError) {
        console.error("[course/status] paid-sibling lookup failed", {
          ...orderLogCtx,
          db_error: paidSiblingOrderError.message,
        });
      } else if (paidSiblingOrder) {
        console.info("[course/status] already_paid_order_found", {
          event: "already_paid_order_found",
          ...orderLogCtx,
          existing_paid_order_id: paidSiblingOrder.id,
        });
        resolvedOrder = {
          ...resolvedOrder,
          payment_status: "paid",
          paid_at: paidSiblingOrder.paid_at ?? resolvedOrder.paid_at,
          razorpay_payment_id: paidSiblingOrder.razorpay_payment_id ?? resolvedOrder.razorpay_payment_id,
          razorpay_order_id: paidSiblingOrder.razorpay_order_id ?? resolvedOrder.razorpay_order_id,
        };
      }
    }

    const normalizedOrderStatus = normalizeStatus(resolvedOrder.payment_status);
    const hasPaidMarker = normalizedOrderStatus === "paid" || Boolean(resolvedOrder.paid_at);
    let effectivePaymentId = paymentId ?? resolvedOrder.razorpay_payment_id ?? null;

    if (!effectivePaymentId && hasPaidMarker && (resolvedOrder.razorpay_order_id ?? orderId)) {
      const razorpay = getRazorpayClient();
      if (razorpay.ok) {
        try {
          const orderPayments = (await razorpay.data.orders.fetchPayments(resolvedOrder.razorpay_order_id ?? orderId ?? "")) as {
            items?: Array<{ id?: string; status?: string }>;
          };
          const captured = (orderPayments.items ?? []).find((item) => normalizeStatus(item.status) === "captured" && item.id);
          if (captured?.id) {
            effectivePaymentId = captured.id;
          }
        } catch (error) {
          console.error("[course/status] unable to derive payment id from order", {
            ...orderLogCtx,
            error: toErrorMessage(error),
          });
        }
      }
    }

    const shouldTryPassiveReconciliation = (!resolvedEnrollment || !transaction) && Boolean(effectivePaymentId);

    if (shouldTryPassiveReconciliation && effectivePaymentId) {
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
          razorpayPaymentId: effectivePaymentId,
          source: "verify_api",
          gatewayResponse: { source: "status_poll_paid_marker" },
        });

        if (reconciled.error) {
          console.error("[course/status] passive reconcile failed (paid marker)", {
            ...orderLogCtx,
            payment_id: effectivePaymentId,
            error: reconciled.error,
          });
        } else {
          const { data: refreshedEnrollment } = await admin.data
            .from("course_enrollments")
            .select("id,enrollment_status,course_order_id")
            .eq("course_order_id", resolvedOrder.id)
            .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
            .maybeSingle<EnrollmentStatusRow>();

          resolvedEnrollment = refreshedEnrollment ?? resolvedEnrollment;
          resolvedOrder = {
            ...resolvedOrder,
            payment_status: "paid",
            razorpay_payment_id: effectivePaymentId,
            paid_at: resolvedOrder.paid_at ?? new Date().toISOString(),
          };
        }
      } else if (razorpay.ok) {
        try {
          const payment = (await razorpay.data.payments.fetch(effectivePaymentId)) as {
            id?: string;
            order_id?: string;
            status?: string;
            amount?: number;
            currency?: string;
            method?: string;
          };

          const expectedAmountInPaise = Math.round(Number(resolvedOrder.gross_amount ?? 0) * 100);
          const paymentCaptured = normalizeStatus(payment.status) === "captured";
          const paymentMatchesOrder =
            payment.id === effectivePaymentId &&
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
              razorpayPaymentId: effectivePaymentId,
              source: "verify_api",
              gatewayResponse: { source: "status_poll", method: payment.method ?? null },
            });

            if (reconciled.error) {
              console.error("[course/status] passive reconcile failed (gateway fetch)", {
                ...orderLogCtx,
                payment_id: effectivePaymentId,
                error: reconciled.error,
              });
            } else {
              const { data: refreshedEnrollment } = await admin.data
                .from("course_enrollments")
                .select("id,enrollment_status,course_order_id")
                .eq("course_order_id", resolvedOrder.id)
                .in("enrollment_status", [...COURSE_ENROLLMENT_ACTIVE_STATUSES])
                .maybeSingle<EnrollmentStatusRow>();

              resolvedEnrollment = refreshedEnrollment ?? resolvedEnrollment;
              resolvedOrder = {
                ...resolvedOrder,
                payment_status: "paid",
                razorpay_payment_id: effectivePaymentId,
                paid_at: new Date().toISOString(),
              };
            }
          }
        } catch (error) {
          console.error("[course/status] razorpay fetch failed", {
            ...orderLogCtx,
            payment_id: effectivePaymentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const normalized = resolveCoursePollingState({
      paymentStatus: resolvedOrder.payment_status,
      enrolled: Boolean(resolvedEnrollment),
    });
    const redirectState = normalized === "pending" ? "pending" : normalized === "failed" ? "failed" : "success";

    console.info("[course/status] exit", {
      ...orderLogCtx,
      final_decision: normalized,
      enrollment_found: Boolean(resolvedEnrollment),
      paid_marker: hasPaidMarker,
    });

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
  } catch (error) {
    console.error("[course/status] unhandled exception", {
      ...logCtx,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, state: "pending", error: "Unable to confirm status right now.", code: "STATUS_ROUTE_UNHANDLED" },
      { status: 503 }
    );
  }
}
