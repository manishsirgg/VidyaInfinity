import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";
import { getRazorpayClient, verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid, reconcilePsychometricOrderPaid, reconcileWebinarOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

async function insertWebhookLogBestEffort({
  admin,
  eventId,
  eventType,
  signature,
  payload,
  signatureValid,
  headerMap,
}: {
  admin: SupabaseClient;
  eventId: string | null;
  eventType: string;
  signature: string;
  payload: unknown;
  signatureValid: boolean;
  headerMap: Headers;
}) {
  const primaryPayload = {
    event_id: eventId,
    event_type: eventType,
    signature: signature || null,
    signature_valid: signatureValid,
    processed: false,
    payload,
    headers: {
      "x-razorpay-signature": signature,
      "user-agent": headerMap.get("user-agent") ?? null,
    },
  };

  const primary = await admin.from("razorpay_webhook_logs").insert(primaryPayload).select("id").maybeSingle<{ id: string }>();
  if (!primary.error) return primary.data?.id ?? null;

  console.error("[razorpay/webhook] rich log insert failed; trying fallback", { eventType, eventId, error: primary.error.message });
  const fallback = await admin
    .from("razorpay_webhook_logs")
    .insert({ event_id: eventId, event_type: eventType, signature_valid: signatureValid, payload })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (fallback.error) {
    console.error("[razorpay/webhook] fallback log insert failed", { eventType, eventId, error: fallback.error.message });
    return null;
  }

  return fallback.data?.id ?? null;
}

export async function POST(request: Request) {
  const headerMap = await headers();
  const signature = headerMap.get("x-razorpay-signature") ?? "";

  try {
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};

    const eventType = payload?.event ?? "unknown";
    const paymentEntity = payload?.payload?.payment?.entity ?? null;
    const orderEntity = payload?.payload?.order?.entity ?? null;
    const eventId = paymentEntity?.id ?? orderEntity?.id ?? null;
    const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
    let razorpayPaymentId = paymentEntity?.id ?? null;

    console.info("[razorpay/webhook] entry", {
      eventType,
      eventId,
      order_id: razorpayOrderId,
      razorpay_order_id: razorpayOrderId,
      payment_id: razorpayPaymentId,
    });

    const schema = await detectPaymentSchemaMismatches(["common", "course", "webinar", "psychometric", "webhook"]);
    if (schema.envError || schema.missing.length || schema.missingColumns.length) {
      console.error("[razorpay/webhook] schema mismatch detected", {
        eventType,
        eventId,
        envError: schema.envError,
        missingTables: schema.missing,
        missingColumns: schema.missingColumns,
      });
    }

    const verifyResult = verifyRazorpayWebhookSignature(raw, signature);
    if (!verifyResult.ok) {
      return NextResponse.json({ ok: false, code: "WEBHOOK_SIGNATURE_CONFIG_ERROR", error: verifyResult.error }, { status: 500 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, code: "ADMIN_CLIENT_UNAVAILABLE", error: admin.error }, { status: 503 });
    }

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

    const insertedLogId = await insertWebhookLogBestEffort({
      admin: admin.data,
      eventId,
      eventType,
      signature,
      payload,
      signatureValid: verifyResult.valid,
      headerMap,
    });

    if (!verifyResult.valid) {
      if (insertedLogId) {
        await admin.data.from("razorpay_webhook_logs").update({ notes: "invalid_signature" }).eq("id", insertedLogId);
      }
      return NextResponse.json({ ok: false, code: "WEBHOOK_SIGNATURE_INVALID", error: "Invalid webhook signature" }, { status: 400 });
    }

    const handledPaymentEvents = ["payment.captured", "payment.failed", "order.paid"];
    if (!handledPaymentEvents.includes(eventType)) {
      if (insertedLogId) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "ignored_event_type" })
          .eq("id", insertedLogId);
      }
      return NextResponse.json({ ok: true, skipped: true, reason: "Unsupported event type" });
    }

    const paymentStatus = typeof paymentEntity?.status === "string" ? paymentEntity.status.toLowerCase() : null;

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Missing order id" });
    }

    const isPaidEvent = eventType === "payment.captured" || eventType === "order.paid";
    const isFailureEvent = eventType === "payment.failed" || paymentStatus === "failed";

    const { data: courseOrder, error: courseOrderError } = await admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (courseOrderError) {
      console.error("[razorpay/webhook] course order lookup failed", {
        eventType,
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        error: courseOrderError.message,
      });
    }

    if (courseOrder) {
      const courseLogCtx = {
        eventType,
        order_id: razorpayOrderId,
        razorpay_order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        course_order_id: courseOrder.id,
      };

      if (isFailureEvent) {
        const { error: updateOrderError } = await admin.data
          .from("course_orders")
          .update({ payment_status: "failed" })
          .eq("id", courseOrder.id)
          .neq("payment_status", "paid");

        if (updateOrderError) {
          console.error("[razorpay/webhook] course order fail update failed", { ...courseLogCtx, error: updateOrderError.message });
        }

        if (razorpayPaymentId) {
          const { error: upsertTxnError } = await admin.data.from("razorpay_transactions").upsert(
            {
              order_type: "course",
              order_id: courseOrder.id,
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
              status: "failed",
              payload: { source: "webhook", payment_status: paymentStatus },
              verified: false,
              gateway_response: { source: "webhook", payment_status: paymentStatus },
            },
            { onConflict: "razorpay_payment_id" }
          );

          if (upsertTxnError) {
            console.error("[razorpay/webhook] transaction upsert failed", { ...courseLogCtx, error: upsertTxnError.message });
          }
        }

        if (insertedLogId) {
          await admin.data
            .from("razorpay_webhook_logs")
            .update({ processed: true, processed_at: new Date().toISOString(), notes: "course_order_marked_failed" })
            .eq("id", insertedLogId);
        }
        console.warn("[razorpay/webhook] exit failure event", { ...courseLogCtx, final_decision: "course_order_failed" });
        return NextResponse.json({ ok: true, reconciled: "course_order_failed" });
      }

      if (isPaidEvent) {
        const eventAmount = Number(paymentEntity?.amount ?? orderEntity?.amount_paid ?? 0);
        const expectedAmount = Math.round(Number(courseOrder.gross_amount ?? 0) * 100);
        const eventCurrency = String(paymentEntity?.currency ?? orderEntity?.currency ?? "").toUpperCase();
        const expectedCurrency = String(courseOrder.currency ?? "").toUpperCase();

        if (eventAmount && (eventAmount !== expectedAmount || !eventCurrency || eventCurrency !== expectedCurrency)) {
          if (insertedLogId) {
            await admin.data
              .from("razorpay_webhook_logs")
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                notes: `course_amount_currency_mismatch:${eventAmount}:${eventCurrency}`,
              })
              .eq("id", insertedLogId);
          }
          return NextResponse.json(
            { ok: false, code: "AMOUNT_CURRENCY_MISMATCH", error: "Webhook payment amount/currency mismatch for course order." },
            { status: 400 }
          );
        }

        if (!razorpayPaymentId) {
          const razorpay = getRazorpayClient();
          if (razorpay.ok) {
            try {
              const paymentList = (await razorpay.data.orders.fetchPayments(razorpayOrderId)) as {
                items?: Array<{ id?: string; status?: string }>;
              };
              const capturedPayment = (paymentList.items ?? []).find(
                (item) => String(item.status ?? "").toLowerCase() === "captured" && item.id
              );
              razorpayPaymentId = capturedPayment?.id ?? null;
            } catch (error) {
              console.warn("[razorpay/webhook] unable to fetch payment id for paid order event", {
                razorpayOrderId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
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
          console.error("[razorpay/webhook] course reconciliation failed", {
            order_id: razorpayOrderId,
            razorpay_order_id: razorpayOrderId,
            payment_id: razorpayPaymentId,
            course_order_id: courseOrder.id,
            error: reconciled.error,
          });
          if (insertedLogId) {
            await admin.data
              .from("razorpay_webhook_logs")
              .update({ notes: `course_reconcile_failed:${reconciled.error}` })
              .eq("id", insertedLogId);
          }
          return NextResponse.json({ ok: false, code: "COURSE_RECONCILE_FAILED", error: reconciled.error }, { status: 202 });
        }

        if (insertedLogId) {
          await admin.data
            .from("razorpay_webhook_logs")
            .update({ processed: true, processed_at: new Date().toISOString(), notes: "course_order_reconciled" })
            .eq("id", insertedLogId);
        }

        console.info("[razorpay/webhook] exit paid event", {
          order_id: razorpayOrderId,
          razorpay_order_id: razorpayOrderId,
          payment_id: razorpayPaymentId,
          course_order_id: courseOrder.id,
          final_decision: "course_order_reconciled",
        });
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
        return NextResponse.json({ ok: false, code: "PSYCHOMETRIC_RECONCILE_FAILED", error: reconciled.error }, { status: 202 });
      }

      if (insertedLogId) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "psychometric_order_reconciled" })
          .eq("id", insertedLogId);
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
        return NextResponse.json({ ok: false, code: "WEBINAR_RECONCILE_FAILED", error: reconciled.error }, { status: 202 });
      }

      if (insertedLogId) {
        await admin.data
          .from("razorpay_webhook_logs")
          .update({ processed: true, processed_at: new Date().toISOString(), notes: "webinar_order_reconciled" })
          .eq("id", insertedLogId);
      }

      return NextResponse.json({ ok: true, reconciled: "webinar_order" });
    }

    return NextResponse.json({ ok: true, skipped: true, reason: "No order mapping" });
  } catch (error) {
    console.error("[razorpay/webhook] unhandled exception", {
      error: error instanceof Error ? error.message : String(error),
      signaturePresent: Boolean(signature),
    });
    return NextResponse.json(
      {
        ok: false,
        code: "WEBHOOK_UNHANDLED",
        error: error instanceof Error ? error.message : "Unable to process webhook",
      },
      { status: 500 }
    );
  }
}
