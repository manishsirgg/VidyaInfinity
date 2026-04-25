import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { isSuccessfulPaymentStatus, normalizePaymentStatus } from "@/lib/payments/payment-status";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalize(value: string | null | undefined) {
  return normalizePaymentStatus(value);
}

async function reconcileWebinarWithRetry(payload: Parameters<typeof reconcileWebinarOrderPaid>[0], attempts = 2) {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reconciled = await reconcileWebinarOrderPaid(payload);
    if (!reconciled.error) return { error: null };
    lastError = reconciled.error;
    console.warn("[payments/webinar/status] webinar_reconcile_retry", {
      event: "webinar_reconcile_retry",
      order_id: payload.order.id,
      razorpay_order_id: payload.razorpayOrderId,
      razorpay_payment_id: payload.razorpayPaymentId,
      attempt,
      attempts,
      error: reconciled.error,
    });
  }
  return { error: lastError ?? "Unable to reconcile webinar payment" };
}

export async function GET(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "webinar"]);
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
    .from("webinar_orders")
    .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status,paid_at,razorpay_order_id,razorpay_payment_id")
    .eq("student_id", auth.user.id)
    .limit(1);

  if (orderId) query = query.eq("razorpay_order_id", orderId);
  else if (paymentId) query = query.eq("razorpay_payment_id", paymentId);

  const { data: order } = await query.maybeSingle<{
    id: string;
    webinar_id: string;
    student_id: string;
    institute_id: string;
    amount: number;
    currency: string;
    payment_status: string;
    order_status: string;
    access_status: string;
    paid_at: string | null;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
  }>();

  if (!order) return NextResponse.json({ ok: false, error: "Webinar order not found" }, { status: 404 });

  const { data: registration } = await admin.data
    .from("webinar_registrations")
    .select("id,access_status,payment_status")
    .eq("webinar_id", order.webinar_id)
    .eq("student_id", auth.user.id)
    .maybeSingle<{ id: string; access_status: string; payment_status: string }>();

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
        console.warn("[payments/webinar/status] unable to derive payment id", {
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const isPaid = normalize(order.payment_status) === "paid" || Boolean(order.paid_at);
  const isGrantedRegistration = normalize(registration?.access_status) === "granted" && ["paid", "not_required"].includes(normalize(registration?.payment_status));
  const needsSync = isPaid && !isGrantedRegistration;

  if (needsSync && effectivePaymentId) {
    const reconcileResult = await reconcileWebinarWithRetry({
      supabase: admin.data,
      order,
      razorpayOrderId: order.razorpay_order_id ?? orderId ?? "",
      razorpayPaymentId: effectivePaymentId,
      source: "verify_api",
      paymentEventType: "payment.status",
    });
    if (reconcileResult.error) {
      console.warn("[payments/webinar/status] webinar_reconcile_failed_non_blocking", {
        event: "webinar_reconcile_failed_non_blocking",
        order_id: order.id,
        webinar_id: order.webinar_id,
        student_id: auth.user.id,
        error: reconcileResult.error,
      });
    }
  }

  const { data: finalRegistration } = await admin.data
    .from("webinar_registrations")
    .select("id")
    .eq("webinar_id", order.webinar_id)
    .eq("student_id", auth.user.id)
    .eq("access_status", "granted")
    .limit(1)
    .maybeSingle<{ id: string }>();

  const isCanonicalSuccess = isSuccessfulPaymentStatus(order.payment_status) || Boolean(order.paid_at);
  if (!isCanonicalSuccess && effectivePaymentId) {
    const razorpay = getRazorpayClient();
    if (razorpay.ok) {
      try {
        const payment = (await razorpay.data.payments.fetch(effectivePaymentId)) as {
          id?: string;
          order_id?: string;
          status?: string;
          amount?: number;
          currency?: string;
        };

        const expectedOrderId = order.razorpay_order_id ?? orderId ?? "";
        const expectedAmountInPaise = Math.round(Number(order.amount ?? 0) * 100);
        const expectedCurrency = String(order.currency ?? "INR").toUpperCase();
        const matchesCapturedPayment = (candidate: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string } | null | undefined) =>
          Boolean(candidate?.id) &&
          normalize(candidate?.status) === "captured" &&
          candidate?.order_id === expectedOrderId &&
          Number(candidate?.amount ?? 0) === expectedAmountInPaise &&
          String(candidate?.currency ?? "").toUpperCase() === expectedCurrency;

        let resolvedCapturedPayment = matchesCapturedPayment(payment) ? payment : null;

        if (!resolvedCapturedPayment) {
          const paymentList = (await razorpay.data.orders.fetchPayments(expectedOrderId)) as {
            items?: Array<{ id?: string; order_id?: string; status?: string; amount?: number; currency?: string }>;
          };
          resolvedCapturedPayment =
            (paymentList.items ?? []).find((item) => matchesCapturedPayment(item)) ??
            (paymentList.items ?? []).find((item) => Boolean(item.id) && normalize(item.status) === "captured" && item.order_id === expectedOrderId) ??
            null;
        }

        if (resolvedCapturedPayment?.id) {
          effectivePaymentId = resolvedCapturedPayment.id;
          console.info("[payments/webinar/status] captured_payment_found_for_pending_order", {
            event: "captured_payment_found_for_pending_order",
            webinar_order_id: order.id,
            webinar_id: order.webinar_id,
            student_id: auth.user.id,
            razorpay_order_id: order.razorpay_order_id ?? orderId,
            razorpay_payment_id: effectivePaymentId,
            order_payment_status: order.payment_status,
          });

          const capturedReconcile = await reconcileWebinarWithRetry({
            supabase: admin.data,
            order,
            razorpayOrderId: order.razorpay_order_id ?? orderId ?? "",
            razorpayPaymentId: effectivePaymentId,
            source: "verify_api",
            paymentEventType: "payment.status.captured",
          });

          if (capturedReconcile.error) {
            console.error("[payments/webinar/status] captured_payment_reconcile_failed", {
              event: "captured_payment_reconcile_failed",
              webinar_order_id: order.id,
              webinar_id: order.webinar_id,
              student_id: auth.user.id,
              razorpay_order_id: order.razorpay_order_id ?? orderId,
              razorpay_payment_id: effectivePaymentId,
              error: capturedReconcile.error,
            });
          }
        }
      } catch (error) {
        console.warn("[payments/webinar/status] unable_to_fetch_payment_during_pending_resolution", {
          webinar_order_id: order.id,
          webinar_id: order.webinar_id,
          student_id: auth.user.id,
          razorpay_order_id: order.razorpay_order_id ?? orderId,
          razorpay_payment_id: effectivePaymentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const refreshedOrder = await admin.data
    .from("webinar_orders")
    .select("payment_status,paid_at")
    .eq("id", order.id)
    .maybeSingle<{ payment_status: string | null; paid_at: string | null }>();

  const refreshedIsPaid =
    isSuccessfulPaymentStatus(refreshedOrder.data?.payment_status ?? order.payment_status) ||
    Boolean(refreshedOrder.data?.paid_at ?? order.paid_at);

  if (refreshedIsPaid || finalRegistration) {
    return NextResponse.json({
      ok: true,
      state: "paid",
      syncPending: refreshedIsPaid && !finalRegistration,
      redirectTo: `/student/payments/success?kind=webinar&order_id=${encodeURIComponent(order.razorpay_order_id ?? order.id)}&payment_id=${encodeURIComponent(effectivePaymentId ?? "")}`,
    });
  }

  if (["failed", "cancelled"].includes(normalize(order.order_status)) || normalize(order.payment_status) === "failed") {
    return NextResponse.json({
      ok: true,
      state: "failed",
      redirectTo: `/student/payments/failed?kind=webinar&order_id=${encodeURIComponent(order.razorpay_order_id ?? order.id)}&payment_id=${encodeURIComponent(effectivePaymentId ?? "")}`,
    });
  }

  return NextResponse.json({ ok: true, state: "pending" });
}
