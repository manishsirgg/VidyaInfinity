import { NextResponse } from "next/server";
import { validate as isUuid } from "uuid";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

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
    .select("id,user_id,test_id,payment_status,final_paid_amount,currency,paid_at,razorpay_order_id,razorpay_payment_id,attempt_id,psychometric_tests(slug)")
    .eq("user_id", auth.user.id)
    .limit(1);

  const orderIdLooksRazorpay = Boolean(orderId?.startsWith("order_"));
  const orderIdLooksUuid = Boolean(orderId && isUuid(orderId));

  if (paymentId) {
    if (orderId && orderIdLooksRazorpay) query = query.or(`razorpay_payment_id.eq.${paymentId},razorpay_order_id.eq.${orderId}`);
    else if (orderId && orderIdLooksUuid) query = query.or(`razorpay_payment_id.eq.${paymentId},id.eq.${orderId}`);
    else query = query.eq("razorpay_payment_id", paymentId);
  } else if (orderId && orderIdLooksRazorpay) {
    query = query.eq("razorpay_order_id", orderId);
  } else if (orderId && orderIdLooksUuid) {
    query = query.eq("id", orderId);
  } else if (orderId) {
    query = query.eq("razorpay_order_id", orderId);
  }

  const { data: order } = await query.maybeSingle<{
    id: string;
    user_id: string;
    test_id: string;
    payment_status: string;
    final_paid_amount: number;
    currency: string;
    paid_at: string | null;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    attempt_id: string | null;
    psychometric_tests: { slug: string | null } | { slug: string | null }[] | null;
  }>();

  if (!order) return NextResponse.json({ ok: false, error: "Psychometric order not found" }, { status: 404 });

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

  let entitlementRow = order.attempt_id ? { id: order.attempt_id } : null;

  if (!entitlementRow && effectivePaymentId && (normalize(order.payment_status) === "paid" || Boolean(order.paid_at))) {
    await reconcilePsychometricOrderPaid({
      supabase: admin.data,
      order,
      razorpayOrderId: order.razorpay_order_id ?? orderId ?? "",
      razorpayPaymentId: effectivePaymentId,
      source: "verify_api",
    });
  }

  const { data: refreshedOrder } = await admin.data.from("psychometric_orders").select("attempt_id").eq("id", order.id).maybeSingle<{ attempt_id: string | null }>();
  const finalEntitlementRow = refreshedOrder?.attempt_id ? { id: refreshedOrder.attempt_id } : null;

  const isPaid = normalize(order.payment_status) === "paid" || Boolean(order.paid_at);
  if (isPaid && finalEntitlementRow?.id) {
    return NextResponse.json({
      ok: true,
      state: "paid",
      attemptId: finalEntitlementRow.id,
      redirectTo: `/dashboard/psychometric/attempts/${finalEntitlementRow.id}`,
    });
  }

  if (isPaid && !finalEntitlementRow?.id) {
    return NextResponse.json({ ok: true, state: "repairable", error: "Payment is captured but attempt is not linked yet. Please retry shortly." }, { status: 202 });
  }

  const testRef = Array.isArray(order.psychometric_tests) ? order.psychometric_tests[0] : order.psychometric_tests;

  if (normalize(order.payment_status) === "failed") {
    return NextResponse.json({
      ok: true,
      state: "failed",
      redirectTo: `/student/payments/failed?kind=psychometric&order_id=${encodeURIComponent(order.razorpay_order_id ?? order.id)}&payment_id=${encodeURIComponent(effectivePaymentId ?? "")}&slug=${encodeURIComponent(testRef?.slug ?? "")}`,
    });
  }

  return NextResponse.json({ ok: true, state: "pending" });
}
