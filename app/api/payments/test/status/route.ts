import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { finalizePaidPsychometricOrder } from "@/lib/payments/psychometric-finalize";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isUuid(value: string | null | undefined) {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

type PsychometricOrderStatusRow = {
  id: string;
  user_id: string;
  test_id: string;
  payment_status: string;
  final_amount: number;
  currency: string;
  paid_at: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
};

export async function GET(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "psychometric"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id") ?? searchParams.get("razorpay_order_id");
  const paymentId = searchParams.get("payment_id") ?? searchParams.get("razorpay_payment_id");

  if (!orderId && !paymentId) {
    return NextResponse.json({ ok: false, error: "order_id or payment_id is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, state: "pending", error: admin.error }, { status: 503 });

  let query = admin.data
    .from("psychometric_orders")
    .select("id,user_id,test_id,payment_status,final_amount,currency,paid_at,razorpay_order_id,razorpay_payment_id")
    .eq("user_id", auth.profile.id)
    .limit(1);

  if (orderId) {
    if (isUuid(orderId)) query = query.eq("id", orderId);
    else if (orderId.startsWith("order_")) query = query.eq("razorpay_order_id", orderId);
    else query = query.eq("razorpay_order_id", orderId);
  } else if (paymentId) {
    query = query.eq("razorpay_payment_id", paymentId);
  }

  const { data: initialOrder } = await query.maybeSingle<PsychometricOrderStatusRow>();

  let order = initialOrder;

  if (!order && paymentId) {
    const { data: byPaymentId } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,payment_status,final_amount,currency,paid_at,razorpay_order_id,razorpay_payment_id,attempt_id")
      .eq("user_id", auth.profile.id)
      .eq("razorpay_payment_id", paymentId)
      .limit(1)
      .maybeSingle<PsychometricOrderStatusRow>();
    if (byPaymentId) order = byPaymentId;
  }

  if (!order) {
    if (paymentId) {
      const razorpay = getRazorpayClient();
      if (razorpay.ok) {
        try {
          const payment = (await razorpay.data.payments.fetch(paymentId)) as {
            id?: string;
            order_id?: string;
            status?: string;
            notes?: Record<string, string>;
          };
          const isCaptured = normalize(payment.status) === "captured";
          if (isCaptured) {
            console.warn("[payments/test/status] captured_payment_local_order_missing", {
              razorpayOrderId: orderId ?? payment.order_id ?? null,
              razorpayPaymentId: paymentId,
              source: "status_api",
            });
            return NextResponse.json(
              {
                ok: false,
                state: "missing",
                error: `Payment captured but local order could not be found. Please contact support with Payment ID: ${paymentId}`,
              },
              { status: 404 }
            );
          }
        } catch {
          // no-op fallback to generic not found
        }
      }
    }
    return NextResponse.json({ ok: false, state: "missing", code: "PSYCHOMETRIC_ORDER_MISSING", error: "Psychometric order row is missing", diagnostics: { order_id: orderId ?? null, payment_id: paymentId ?? null } }, { status: 404 });
  }

  let effectivePaymentId = paymentId ?? order.razorpay_payment_id ?? null;

  if (!effectivePaymentId && (order.razorpay_order_id ?? orderId)) {
    const razorpay = getRazorpayClient();
    if (razorpay.ok) {
      try {
        const paymentList = (await razorpay.data.orders.fetchPayments(order.razorpay_order_id ?? orderId ?? "")) as {
          items?: Array<{ id?: string; status?: string }>;
        };
        const captured = (paymentList.items ?? []).find((item) => normalize(item.status) === "captured" && item.id);
        effectivePaymentId = captured?.id ?? null;
      } catch (error) {
        console.warn("[payments/test/status] unable to derive payment id", {
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  let finalizedAttemptId: string | null = null;

  if (effectivePaymentId && (normalize(order.payment_status) === "paid" || Boolean(order.paid_at))) {
    await reconcilePsychometricOrderPaid({
      supabase: admin.data,
      order,
      razorpayOrderId: order.razorpay_order_id ?? orderId ?? "",
      razorpayPaymentId: effectivePaymentId,
      source: "verify_api",
    });
  }

  const finalized = await finalizePaidPsychometricOrder({ supabase: admin.data, psychometricOrderId: order.id, source: "status_api" });
  if (finalized.error) return NextResponse.json({ ok: false, state: "pending", error: finalized.error }, { status: 500 });
  finalizedAttemptId = finalized.attemptId ?? null;

  const isPaid = normalize(order.payment_status) === "paid" || Boolean(order.paid_at);
  if (isPaid || finalizedAttemptId) {
    return NextResponse.json({
      ok: true,
      state: "paid",
      attempt_id: finalizedAttemptId,
      redirectTo: finalizedAttemptId
        ? `/dashboard/psychometric/attempts/${finalizedAttemptId}`
        : `/student/payments/success?kind=psychometric&order_id=${encodeURIComponent(order.razorpay_order_id ?? order.id)}&payment_id=${encodeURIComponent(effectivePaymentId ?? "")}`,
    });
  }

  if (normalize(order.payment_status) === "failed") {
    return NextResponse.json({
      ok: true,
      state: "failed",
      redirectTo: `/student/payments/failed?kind=psychometric&order_id=${encodeURIComponent(order.razorpay_order_id ?? order.id)}&payment_id=${encodeURIComponent(effectivePaymentId ?? "")}`,
    });
  }

  return NextResponse.json({ ok: true, state: "pending" });
}
