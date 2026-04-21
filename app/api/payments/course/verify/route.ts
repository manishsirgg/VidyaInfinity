import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
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
      return NextResponse.json(
        {
          ok: false,
          state: "failed",
          error: "orderId, paymentId, signature are required",
          redirectUrl: "/student/payments/failed",
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        { ok: false, state: "failed", error: "Order not found for this user.", redirectUrl: "/student/payments/failed" },
        { status: 404 }
      );
    }

    if (order.payment_status === "paid") {
      console.info("[course/verify] idempotent paid response", { orderId: order.id, razorpayOrderId: orderId, paymentId });
      return NextResponse.json({
        ok: true,
        idempotent: true,
        state: "success",
        message: "Order already verified.",
        redirectUrl: "/student/payments/success",
      });
    }

    const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

    if (!signatureResult.valid) {
      await admin.data.from("course_orders").update({ payment_status: "failed" }).eq("id", order.id);
      console.warn("[course/verify] signature invalid", { orderId: order.id, razorpayOrderId: orderId, paymentId });
      return NextResponse.json(
        { ok: false, state: "failed", error: "Payment signature validation failed.", redirectUrl: "/student/payments/failed" },
        { status: 400 }
      );
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
    };

    let payment: RazorpayPayment;
    try {
      payment = (await razorpay.data.payments.fetch(paymentId)) as RazorpayPayment;
    } catch (error) {
      console.error("[course/verify] payment fetch failed", {
        orderId: order.id,
        razorpayOrderId: orderId,
        paymentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return NextResponse.json(
        {
          ok: false,
          state: "pending",
          error: error instanceof Error ? error.message : "Unable to validate payment.",
          redirectUrl: `/student/payments/pending?razorpay_order_id=${encodeURIComponent(orderId)}`,
        },
        { status: 502 }
      );
    }

    const expectedAmountInPaise = Math.round(Number(order.gross_amount) * 100);
    if (
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      payment.status !== "captured" ||
      Number(payment.amount ?? 0) !== expectedAmountInPaise ||
      (payment.currency ?? "").toUpperCase() !== order.currency.toUpperCase()
    ) {
      await admin.data.from("course_orders").update({ payment_status: "failed" }).eq("id", order.id).in("payment_status", ["created", "failed"]);
      console.warn("[course/verify] payment validation failed", {
        orderId: order.id,
        razorpayOrderId: orderId,
        paymentId,
        paymentStatus: payment.status,
      });
      return NextResponse.json(
        { ok: false, state: "failed", error: "Payment validation failed.", redirectUrl: "/student/payments/failed" },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          ok: false,
          state: "pending",
          error: reconciled.error,
          redirectUrl: `/student/payments/pending?razorpay_order_id=${encodeURIComponent(orderId)}`,
        },
        { status: 500 }
      );
    }

    await admin.data.from("student_cart_items").delete().eq("student_id", studentId).eq("course_id", order.course_id);

    console.info("[course/verify] payment verified", { orderId: order.id, razorpayOrderId: orderId, paymentId });
    return NextResponse.json({
      ok: true,
      idempotent: false,
      state: "success",
      message: "Payment verified and enrollment confirmed.",
      redirectUrl: "/student/payments/success",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        state: "pending",
        error: error instanceof Error ? error.message : "Unable to verify course payment.",
        redirectUrl: "/student/payments/pending",
      },
      { status: 500 }
    );
  }
}
