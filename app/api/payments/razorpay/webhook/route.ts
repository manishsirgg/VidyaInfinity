import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid, reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const headerMap = await headers();
    const signature = headerMap.get("x-razorpay-signature") ?? "";
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};

    const eventType = payload?.event ?? "unknown";
    const eventId = payload?.payload?.payment?.entity?.id ?? payload?.payload?.order?.entity?.id ?? null;

    const verifyResult = verifyRazorpayWebhookSignature(raw, signature);
    if (!verifyResult.ok) {
      return NextResponse.json({ error: verifyResult.error }, { status: 500 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    if (eventId) {
      const { data: existing } = await admin.data
        .from("razorpay_webhook_logs")
        .select("id")
        .eq("event_id", eventId)
        .eq("event_type", eventType)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, idempotent: true });
      }
    }

    const { data: insertedLog } = await admin.data
      .from("razorpay_webhook_logs")
      .insert({
        event_id: eventId,
        event_type: eventType,
        signature: signature || null,
        processed: false,
        payload,
        headers: {
          "x-razorpay-signature": signature,
          "user-agent": headerMap.get("user-agent") ?? null,
        },
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!verifyResult.valid) {
      if (insertedLog?.id) {
        await admin.data.from("razorpay_webhook_logs").update({ notes: "invalid_signature" }).eq("id", insertedLog.id);
      }
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    if (!eventType.startsWith("payment.")) {
      if (insertedLog?.id) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "ignored_non_payment_event" })
          .eq("id", insertedLog.id);
      }
      return NextResponse.json({ ok: true, skipped: true, reason: "Unsupported event type" });
    }

    const paymentEntity = payload?.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    const razorpayPaymentId = paymentEntity?.id;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Missing order/payment id" });
    }

    const { data: courseOrder } = await admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (courseOrder) {
      const reconciled = await reconcileCourseOrderPaid({
        supabase: admin.data,
        order: courseOrder,
        razorpayOrderId,
        razorpayPaymentId,
        source: "webhook",
      });

      if (reconciled.error) {
        return NextResponse.json({ error: reconciled.error }, { status: 500 });
      }

      if (insertedLog?.id) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "course_order_reconciled" })
          .eq("id", insertedLog.id);
      }

      return NextResponse.json({ ok: true, reconciled: "course_order" });
    }

    const { data: psychometricOrder } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,final_paid_amount,currency,payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (psychometricOrder) {
      const reconciled = await reconcilePsychometricOrderPaid({
        supabase: admin.data,
        order: psychometricOrder,
        razorpayOrderId,
        razorpayPaymentId,
        source: "webhook",
      });

      if (reconciled.error) {
        return NextResponse.json({ error: reconciled.error }, { status: 500 });
      }

      if (insertedLog?.id) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "psychometric_order_reconciled" })
          .eq("id", insertedLog.id);
      }

      return NextResponse.json({ ok: true, reconciled: "psychometric_order" });
    }

    return NextResponse.json({ ok: true, skipped: true, reason: "No order mapping" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process webhook" },
      { status: 500 }
    );
  }
}
