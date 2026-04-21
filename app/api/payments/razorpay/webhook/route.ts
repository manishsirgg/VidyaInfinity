import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid, reconcilePsychometricOrderPaid, reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "course", "webinar", "psychometric", "webhook"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  try {
    const headerMap = await headers();
    const signature = headerMap.get("x-razorpay-signature") ?? "";
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};

    const eventType = payload?.event ?? "unknown";
    const paymentEntity = payload?.payload?.payment?.entity ?? null;
    const orderEntity = payload?.payload?.order?.entity ?? null;
    const eventId = paymentEntity?.id ?? orderEntity?.id ?? null;

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
        console.info("[razorpay/webhook] duplicate event ignored", { eventType, eventId });
        return NextResponse.json({ ok: true, idempotent: true });
      }
    }

    const { data: insertedLog } = await admin.data
      .from("razorpay_webhook_logs")
      .insert({
        event_id: eventId,
        event_type: eventType,
        signature: signature || null,
        signature_valid: verifyResult.valid,
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

    const handledPaymentEvents = ["payment.captured", "payment.failed", "order.paid"];
    if (!handledPaymentEvents.includes(eventType)) {
      if (insertedLog?.id) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "ignored_event_type" })
          .eq("id", insertedLog.id);
      }
      return NextResponse.json({ ok: true, skipped: true, reason: "Unsupported event type" });
    }

    const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
    const razorpayPaymentId = paymentEntity?.id ?? null;
    const paymentStatus = typeof paymentEntity?.status === "string" ? paymentEntity.status.toLowerCase() : null;

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Missing order id" });
    }

    const isPaidEvent = eventType === "payment.captured" || eventType === "order.paid";
    const isFailureEvent = eventType === "payment.failed" || paymentStatus === "failed";

    const { data: courseOrder } = await admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (courseOrder) {
      if (isFailureEvent) {
        await admin.data
          .from("course_orders")
          .update({ payment_status: "failed" })
          .eq("id", courseOrder.id)
          .neq("payment_status", "paid");

        if (razorpayPaymentId) {
          await admin.data.from("razorpay_transactions").upsert(
            {
              order_kind: "course_enrollment",
              course_order_id: courseOrder.id,
              user_id: courseOrder.student_id,
              institute_id: courseOrder.institute_id,
              razorpay_order_id: razorpayOrderId,
              razorpay_payment_id: razorpayPaymentId,
              event_type: eventType,
              payment_status: "failed",
              amount: courseOrder.gross_amount,
              currency: courseOrder.currency,
              verified: false,
              gateway_response: { source: "webhook", payment_status: paymentStatus },
            },
            { onConflict: "razorpay_payment_id" }
          );
        }

        if (insertedLog?.id) {
          await admin.data
            .from("razorpay_webhook_logs")
            .update({ processed: true, processed_at: new Date().toISOString(), notes: "course_order_marked_failed" })
            .eq("id", insertedLog.id);
        }
        console.warn("[razorpay/webhook] course payment failed", { eventType, razorpayOrderId, razorpayPaymentId });
        return NextResponse.json({ ok: true, reconciled: "course_order_failed" });
      }

      if (isPaidEvent) {
        const eventAmount = Number(paymentEntity?.amount ?? orderEntity?.amount_paid ?? 0);
        const expectedAmount = Math.round(Number(courseOrder.gross_amount ?? 0) * 100);
        const eventCurrency = String(paymentEntity?.currency ?? orderEntity?.currency ?? "").toUpperCase();
        const expectedCurrency = String(courseOrder.currency ?? "").toUpperCase();

        if (eventAmount && (eventAmount !== expectedAmount || !eventCurrency || eventCurrency !== expectedCurrency)) {
          if (insertedLog?.id) {
            await admin.data
              .from("razorpay_webhook_logs")
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                notes: `course_amount_currency_mismatch:${eventAmount}:${eventCurrency}`,
              })
              .eq("id", insertedLog.id);
          }
          return NextResponse.json({ error: "Webhook payment amount/currency mismatch for course order." }, { status: 400 });
        }

        if (!razorpayPaymentId) {
          return NextResponse.json({ ok: true, skipped: true, reason: "Missing payment id for paid event" });
        }

        const reconciled = await reconcileCourseOrderPaid({
          supabase: admin.data,
          order: courseOrder,
          razorpayOrderId,
          razorpayPaymentId,
          source: "webhook",
          gatewayResponse: { webhookEventType: eventType, paymentStatus: paymentStatus ?? null },
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

        console.info("[razorpay/webhook] course payment reconciled", { eventType, razorpayOrderId, razorpayPaymentId });
        return NextResponse.json({ ok: true, reconciled: "course_order" });
      }
    }

    const { data: psychometricOrder } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,final_paid_amount,currency,payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (psychometricOrder && isPaidEvent && razorpayPaymentId) {
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

    const { data: webinarOrder } = await admin.data
      .from("webinar_orders")
      .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (webinarOrder && isPaidEvent && razorpayPaymentId) {
      const reconciled = await reconcileWebinarOrderPaid({
        supabase: admin.data,
        order: webinarOrder,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: signature || undefined,
        source: "webhook",
        paymentEventType: eventType,
      });

      if (reconciled.error) {
        return NextResponse.json({ error: reconciled.error }, { status: 500 });
      }

      if (insertedLog?.id) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "webinar_order_reconciled" })
          .eq("id", insertedLog.id);
      }

      return NextResponse.json({ ok: true, reconciled: "webinar_order" });
    }

    return NextResponse.json({ ok: true, skipped: true, reason: "No order mapping" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process webhook" },
      { status: 500 }
    );
  }
}
