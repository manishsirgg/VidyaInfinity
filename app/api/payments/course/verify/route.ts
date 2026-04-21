import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { buildCoursePaymentRedirect, resolveCourseVerifyState } from "@/lib/payments/course-payment-status";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient, verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
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

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "course"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  try {
    const auth = await requireApiUser("student", { requireApproved: false });
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { orderId, paymentId, signature } = (await request.json()) as {
      orderId?: string;
      paymentId?: string;
      signature?: string;
    };

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: "orderId, paymentId, signature are required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: studentProfile, error: studentProfileError } = await admin.data
      .from("profiles")
      .select("id,role")
      .eq("id", user.id)
      .maybeSingle<StudentProfileRow>();

    if (studentProfileError) {
      console.error("[course/verify] student profile lookup failed", {
        userId: user.id,
        error: studentProfileError.message,
      });
      return NextResponse.json({ error: "Unable to validate student profile." }, { status: 500 });
    }

    if (!studentProfile) {
      console.warn("[course/verify] student profile missing", { userId: user.id });
      return NextResponse.json({ error: "Student profile missing. Please complete your account setup." }, { status: 400 });
    }

    if (normalizeStatus(studentProfile.role) !== "student") {
      console.warn("[course/verify] non-student profile attempted course verification", {
        userId: user.id,
        profileRole: studentProfile.role,
      });
      return NextResponse.json({ error: "Only student accounts can verify course payments." }, { status: 403 });
    }

    const studentId = studentProfile.id;

    const { data: order, error: orderFetchError } = await admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,payment_status,gross_amount,institute_receivable_amount,currency,razorpay_payment_id")
      .eq("razorpay_order_id", orderId)
      .eq("student_id", studentId)
      .maybeSingle<{
        id: string;
        student_id: string;
        course_id: string;
        institute_id: string;
        payment_status: string;
        gross_amount: number;
        institute_receivable_amount: number;
        currency: string;
        razorpay_payment_id: string | null;
      }>();

    if (orderFetchError || !order) {
      return NextResponse.json({ error: "Order not found for this user." }, { status: 404 });
    }

    const { data: existingEnrollment } = await admin.data
      .from("course_enrollments")
      .select("id")
      .eq("course_order_id", order.id)
      .maybeSingle();

    if (order.payment_status === "paid") {
      const state = resolveCourseVerifyState({ paymentStatus: order.payment_status, enrolled: Boolean(existingEnrollment) });
      const redirectTo = buildCoursePaymentRedirect({
        state,
        orderId,
        paymentId: order.razorpay_payment_id ?? paymentId,
      });

      return NextResponse.json({ ok: true, idempotent: true, state, redirectTo, orderId, paymentId: order.razorpay_payment_id ?? paymentId });
    }

    const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

    if (!signatureResult.valid) {
      await admin.data.from("course_orders").update({ payment_status: "failed" }).eq("id", order.id).neq("payment_status", "paid");
      const redirectTo = buildCoursePaymentRedirect({ state: "failed", orderId, paymentId, reason: "signature_invalid" });
      return NextResponse.json({ ok: false, state: "failed", redirectTo, error: "Payment signature validation failed." }, { status: 400 });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    type RazorpayPayment = {
      id?: string;
      order_id?: string;
      status?: string;
      amount?: number;
      currency?: string;
      method?: string;
      error_code?: string;
      error_description?: string;
    };

    let payment: RazorpayPayment;
    try {
      payment = (await razorpay.data.payments.fetch(paymentId)) as RazorpayPayment;
    } catch (error) {
      console.error("[course/verify] payment fetch failed", { orderId, paymentId, error: error instanceof Error ? error.message : error });
      const redirectTo = buildCoursePaymentRedirect({ state: "pending", orderId, paymentId, reason: "payment_fetch_uncertain" });
      return NextResponse.json({ ok: false, state: "pending", redirectTo, error: "Payment status is not yet confirmed." }, { status: 202 });
    }

    const expectedAmountInPaise = Math.round(Number(order.gross_amount) * 100);
    const payloadMismatch =
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      Number(payment.amount ?? 0) !== expectedAmountInPaise ||
      (payment.currency ?? "").toUpperCase() !== order.currency.toUpperCase();

    if (payloadMismatch) {
      await admin.data.from("course_orders").update({ payment_status: "failed" }).eq("id", order.id).in("payment_status", ["created", "failed"]);
      const redirectTo = buildCoursePaymentRedirect({ state: "failed", orderId, paymentId, reason: "amount_or_order_mismatch" });
      return NextResponse.json({ ok: false, state: "failed", redirectTo, error: "Payment validation failed." }, { status: 400 });
    }

    if ((payment.status ?? "").toLowerCase() !== "captured") {
      const redirectTo = buildCoursePaymentRedirect({ state: "pending", orderId, paymentId, reason: "awaiting_capture" });
      console.info("[course/verify] payment not captured yet", { orderId, paymentId, paymentStatus: payment.status ?? null });
      return NextResponse.json({ ok: false, state: "pending", redirectTo, message: "Payment captured event pending." }, { status: 202 });
    }

    const reconciled = await reconcileCourseOrderPaid({
      supabase: admin.data,
      order,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      source: "verify_api",
      gatewayResponse: {
        method: payment.method ?? null,
      },
    });

    if (reconciled.error) {
      console.error("[course/verify] reconciliation failed", { orderId, paymentId, error: reconciled.error });
      return NextResponse.json({ error: reconciled.error }, { status: 500 });
    }

    await admin.data.from("student_cart_items").delete().eq("student_id", studentId).eq("course_id", order.course_id);

    const redirectTo = buildCoursePaymentRedirect({ state: "success", orderId, paymentId });
    console.info("[course/verify] payment verified", { orderId, paymentId, orderRecordId: order.id, studentId });

    return NextResponse.json({
      ok: true,
      state: "success",
      redirectTo,
      idempotent: false,
      orderId,
      paymentId,
      message: "Payment verified and enrollment confirmed.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify course payment." },
      { status: 500 }
    );
  }
}
