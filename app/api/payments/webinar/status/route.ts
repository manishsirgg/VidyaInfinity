import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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
    .in("access_status", ["granted"])
    .in("payment_status", ["paid", "not_required"])
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

  if (!registration && effectivePaymentId && (normalize(order.payment_status) === "paid" || Boolean(order.paid_at))) {
    await reconcileWebinarOrderPaid({
      supabase: admin.data,
      order,
      razorpayOrderId: order.razorpay_order_id ?? orderId ?? "",
      razorpayPaymentId: effectivePaymentId,
      source: "verify_api",
      paymentEventType: "payment.status",
    });
  }

  const { data: finalRegistration } = await admin.data
    .from("webinar_registrations")
    .select("id")
    .eq("webinar_id", order.webinar_id)
    .eq("student_id", auth.user.id)
    .eq("access_status", "granted")
    .limit(1)
    .maybeSingle<{ id: string }>();

  const isPaid = normalize(order.payment_status) === "paid" || Boolean(order.paid_at);
  if (isPaid || finalRegistration) {
    return NextResponse.json({
      ok: true,
      state: "paid",
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
