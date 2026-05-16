import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";
import { getRazorpayClient, verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { applyRefundToInstitutePayout } from "@/lib/payments/institute-payout-refunds";
import { mapRazorpayRefundStatus } from "@/lib/payments/refunds";
import { reconcileRefundAccessAndOrderState } from "@/lib/payments/refund-reconciliation";
import { reconcilePsychometricOrderPaid } from "@/lib/payments/reconcile";
import { finalizePaidPsychometricOrder } from "@/lib/payments/psychometric-finalize";
import { finalizeCoursePaymentFromRazorpay, finalizeWebinarPaymentFromRazorpay } from "@/lib/payments/finalize";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder, fetchRazorpayPaymentForOrder } from "@/lib/featured-reconciliation";
import { REFUND_ORDER_TYPE_TO_CANONICAL_KIND } from "@/lib/payments/order-kinds";
import type { SupabaseClient } from "@supabase/supabase-js";

async function applyPayoutRefundIfApplicable(
  admin: SupabaseClient,
  payload: {
    refundId: string;
    refundAmount: number;
    courseOrderId: string | null;
    webinarOrderId: string | null;
    refundReference: string;
  }
) {
  const payoutOrderKind = payload.courseOrderId ? "course_order" : payload.webinarOrderId ? "webinar_order" : null;
  const payoutOrderId = payload.courseOrderId ?? payload.webinarOrderId;
  if (!payoutOrderKind || !payoutOrderId) return { ok: true as const };

  return applyRefundToInstitutePayout(admin, {
    orderKind: payoutOrderKind,
    orderId: payoutOrderId,
    refundAmount: payload.refundAmount,
    refundReference: payload.refundReference,
  });
}

async function insertWebhookLogBestEffort({
  admin,
  enabled,
  eventId,
  eventType,
  signature,
  payload,
  signatureValid,
  headerMap,
}: {
  admin: SupabaseClient;
  enabled: boolean;
  eventId: string | null;
  eventType: string;
  signature: string;
  payload: unknown;
  signatureValid: boolean;
  headerMap: Headers;
}) {
  if (!enabled) return null;

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

async function updateWebhookLogBestEffort({
  admin,
  enabled,
  logId,
  patch,
  eventType,
  eventId,
}: {
  admin: SupabaseClient;
  enabled: boolean;
  logId: string | null;
  patch: Record<string, unknown>;
  eventType: string;
  eventId: string | null;
}) {
  if (!enabled || !logId) return;
  const { error } = await admin.from("razorpay_webhook_logs").update(patch).eq("id", logId);
  if (error) {
    console.error("[razorpay/webhook] webhook log update skipped after db error", {
      eventType,
      eventId,
      logId,
      db_error: error.message,
    });
  }
}

export async function POST(request: Request) {
  const headerMap = await headers();
  const signature = headerMap.get("x-razorpay-signature") ?? "";

  try {
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};

    const eventType = payload?.event ?? "unknown";
    const paymentEntity = payload?.payload?.payment?.entity ?? null;
    const refundEntity = payload?.payload?.refund?.entity ?? null;
    const orderEntity = payload?.payload?.order?.entity ?? null;
    const eventId = refundEntity?.id ?? paymentEntity?.id ?? orderEntity?.id ?? null;
    const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
    let razorpayPaymentId = paymentEntity?.id ?? refundEntity?.payment_id ?? null;
    const paymentNotes = (paymentEntity?.notes ?? orderEntity?.notes ?? {}) as Record<string, unknown>;
    const notePsychometricOrderId =
      typeof paymentNotes.psychometric_order_id === "string"
        ? paymentNotes.psychometric_order_id
        : typeof paymentNotes.psychometricOrderId === "string"
          ? paymentNotes.psychometricOrderId
          : typeof paymentNotes.local_order_id === "string"
            ? paymentNotes.local_order_id
            : typeof paymentNotes.localOrderId === "string"
              ? paymentNotes.localOrderId
              : typeof paymentNotes.order_id === "string"
                ? paymentNotes.order_id
                : null;
    const noteCourseOrderId = typeof paymentNotes.course_order_id === "string" ? paymentNotes.course_order_id : null;
    const noteWebinarOrderId = typeof paymentNotes.webinar_order_id === "string" ? paymentNotes.webinar_order_id : null;
    const noteOrderId = typeof paymentNotes.order_id === "string" ? paymentNotes.order_id : null;

    console.info("[razorpay/webhook] entry", {
      eventType,
      eventId,
      order_id: razorpayOrderId,
      razorpay_order_id: razorpayOrderId,
      payment_id: razorpayPaymentId,
      note_order_id: noteOrderId,
      note_psychometric_order_id: notePsychometricOrderId,
      note_course_order_id: noteCourseOrderId,
      note_webinar_order_id: noteWebinarOrderId,
    });

    const courseSchema = await detectPaymentSchemaMismatches(["common", "course"]);
    if (courseSchema.envError || courseSchema.missing.length || courseSchema.missingColumns.length) {
      console.error("[razorpay/webhook] course-critical schema mismatch detected", {
        eventType,
        eventId,
        envError: courseSchema.envError,
        missingTables: courseSchema.missing,
        missingColumns: courseSchema.missingColumns,
      });
    }

    const webhookSchema = await detectPaymentSchemaMismatches(["webhook"]);
    const webhookLogAvailable = !webhookSchema.envError && !webhookSchema.missing.length && !webhookSchema.missingColumns.length;
    if (!webhookLogAvailable) {
      console.warn("[razorpay/webhook] webhook log persistence unavailable; continuing without webhook log writes", {
        eventType,
        eventId,
        envError: webhookSchema.envError,
        missingTables: webhookSchema.missing,
        missingColumns: webhookSchema.missingColumns,
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

    if (eventId && webhookLogAvailable) {
      const { data: existing, error: duplicateLookupError } = await admin.data
        .from("razorpay_webhook_logs")
        .select("id")
        .eq("event_id", eventId)
        .eq("event_type", eventType)
        .maybeSingle();

      if (duplicateLookupError) {
        console.warn("[razorpay/webhook] duplicate check skipped after db error", {
          eventType,
          eventId,
          order_id: razorpayOrderId,
          payment_id: razorpayPaymentId,
          db_error: duplicateLookupError.message,
        });
      }

      if (existing) {
        console.info("[razorpay/webhook] duplicate event ignored", { eventType, eventId });
        return NextResponse.json({ ok: true, idempotent: true });
      }
    }

    const insertedLogId = await insertWebhookLogBestEffort({
      admin: admin.data,
      enabled: webhookLogAvailable,
      eventId,
      eventType,
      signature,
      payload,
      signatureValid: verifyResult.valid,
      headerMap,
    });

    if (!verifyResult.valid) {
      await updateWebhookLogBestEffort({
        admin: admin.data,
        enabled: webhookLogAvailable,
        logId: insertedLogId,
        patch: { notes: "invalid_signature" },
        eventType,
        eventId,
      });
      return NextResponse.json({ ok: false, code: "WEBHOOK_SIGNATURE_INVALID", error: "Invalid webhook signature" }, { status: 400 });
    }

    const handledEvents = ["payment.captured", "payment.failed", "order.paid", "refund.processed", "refund.failed"];
    if (!handledEvents.includes(eventType)) {
      await updateWebhookLogBestEffort({
        admin: admin.data,
        enabled: webhookLogAvailable,
        logId: insertedLogId,
        patch: { processed: true, processed_at: new Date().toISOString(), notes: "ignored_event_type" },
        eventType,
        eventId,
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "Unsupported event type" });
    }

    const paymentStatus = typeof paymentEntity?.status === "string" ? paymentEntity.status.toLowerCase() : null;
    const isRefundEvent = eventType === "refund.processed" || eventType === "refund.failed";

    if (isRefundEvent && refundEntity?.id) {
      const localStatus = mapRazorpayRefundStatus(refundEntity.status);
      const { data: refundRow, error: refundFetchError } = await admin.data
        .from("refunds")
        .select("id,amount,refund_status,course_order_id,psychometric_order_id,webinar_order_id,metadata")
        .or(`razorpay_refund_id.eq.${refundEntity.id},and(razorpay_payment_id.eq.${refundEntity.payment_id},refund_status.eq.processing)`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (refundFetchError) {
        return NextResponse.json({ ok: false, code: "REFUND_LOOKUP_FAILED", error: refundFetchError.message }, { status: 500 });
      }

      if (!refundRow) {
        await updateWebhookLogBestEffort({
          admin: admin.data,
          enabled: webhookLogAvailable,
          logId: insertedLogId,
          patch: { processed: true, processed_at: new Date().toISOString(), notes: "refund_not_mapped" },
          eventType,
          eventId,
        });
        return NextResponse.json({ ok: true, skipped: true, reason: "Refund not mapped locally" });
      }

      if (["refunded", "failed", "cancelled"].includes(refundRow.refund_status)) {
        if (localStatus === "refunded") {
          const payoutRefundReference = String(refundEntity.id ?? refundRow.id);
          const payoutSync = await applyPayoutRefundIfApplicable(admin.data, {
            refundId: refundRow.id,
            refundAmount: Number(refundRow.amount ?? (refundEntity.amount ? Number(refundEntity.amount) / 100 : 0)),
            courseOrderId: refundRow.course_order_id ?? null,
            webinarOrderId: refundRow.webinar_order_id ?? null,
            refundReference: payoutRefundReference,
          });
          if (!payoutSync.ok) {
            return NextResponse.json({ ok: false, code: "REFUND_WALLET_ADJUSTMENT_FAILED", error: payoutSync.error }, { status: 500 });
          }
        }

        await updateWebhookLogBestEffort({
          admin: admin.data,
          enabled: webhookLogAvailable,
          logId: insertedLogId,
          patch: { processed: true, processed_at: new Date().toISOString(), notes: "refund_event_idempotent" },
          eventType,
          eventId,
        });
        return NextResponse.json({ ok: true, idempotent: true });
      }

      const nextStatus = localStatus === "refunded" ? "refunded" : "failed";
      const { data: updatedRefund, error: refundUpdateError } = await admin.data
        .from("refunds")
        .update({
          refund_status: nextStatus,
          razorpay_refund_id: refundEntity.id,
          failed_at: nextStatus === "failed" ? new Date().toISOString() : null,
          metadata: {
            ...(refundRow.metadata ?? {}),
            webhook_event_type: eventType,
            razorpay_refund_status: refundEntity.status ?? null,
            razorpay_refund_amount_subunits: refundEntity.amount ?? null,
          },
        })
        .eq("id", refundRow.id)
        .select("id,amount,refund_status,course_order_id,psychometric_order_id,webinar_order_id")
        .single();

      if (refundUpdateError || !updatedRefund) {
        return NextResponse.json({ ok: false, code: "REFUND_UPDATE_FAILED", error: refundUpdateError?.message ?? "Failed to update refund" }, { status: 500 });
      }

      const updatedRefundAmount = Number(updatedRefund.amount ?? (refundEntity.amount ? Number(refundEntity.amount) / 100 : 0));

      if (updatedRefund.refund_status === "refunded") {
        const refundedAt = new Date().toISOString();
        await reconcileRefundAccessAndOrderState({
          supabase: admin.data,
          targets: {
            course_order_id: updatedRefund.course_order_id ?? null,
            psychometric_order_id: updatedRefund.psychometric_order_id ?? null,
            webinar_order_id: updatedRefund.webinar_order_id ?? null,
          },
          refundedAt,
        });
        console.info("[razorpay/webhook] refund_order_entitlement_reconciled", {
          eventType,
          eventId,
          refund_id: updatedRefund.id,
          refunded_at: refundedAt,
          course_order_id: updatedRefund.course_order_id,
          psychometric_order_id: updatedRefund.psychometric_order_id,
          webinar_order_id: updatedRefund.webinar_order_id,
        });

        const payoutRefundReference = String(refundEntity.id ?? updatedRefund.id);
        const payoutRefundResult = await applyPayoutRefundIfApplicable(admin.data, {
          refundId: updatedRefund.id,
          refundAmount: Number(updatedRefundAmount),
          courseOrderId: updatedRefund.course_order_id ?? null,
          webinarOrderId: updatedRefund.webinar_order_id ?? null,
          refundReference: payoutRefundReference,
        });
        if (!payoutRefundResult.ok) {
          return NextResponse.json({ ok: false, code: "REFUND_WALLET_ADJUSTMENT_FAILED", error: payoutRefundResult.error }, { status: 500 });
        }
      }

      await updateWebhookLogBestEffort({
        admin: admin.data,
        enabled: webhookLogAvailable,
        logId: insertedLogId,
        patch: { processed: true, processed_at: new Date().toISOString(), notes: `refund_reconciled:${nextStatus}` },
        eventType,
        eventId,
      });

      return NextResponse.json({ ok: true, reconciled: "refund", status: nextStatus });
    }

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Missing order id" });
    }

    
    const isPaidEvent = eventType === "payment.captured" || eventType === "order.paid";
    const isFailureEvent = eventType === "payment.failed" || paymentStatus === "failed";

    if (isPaidEvent) {
      const featuredTables = [
        { table: "featured_listing_orders", type: "institute" as const },
        { table: "course_featured_orders", type: "course" as const },
        { table: "webinar_featured_orders", type: "webinar" as const },
      ];
      for (const item of featuredTables) {
        const { data: featureOrder } = await admin.data.from(item.table).select("id,payment_status,razorpay_order_id,razorpay_payment_id").eq("razorpay_order_id", razorpayOrderId).limit(1).maybeSingle();
        if (!featureOrder) continue;
        const paymentIdResolved = razorpayPaymentId ?? featureOrder.razorpay_payment_id ?? (await fetchRazorpayPaymentForOrder(razorpayOrderId)).paymentId ?? undefined;
        const activated = await activateFeaturedSubscriptionFromPaidOrder({ supabase: admin.data, orderType: item.type, orderId: featureOrder.id, razorpayOrderId, razorpayPaymentId: paymentIdResolved, razorpaySignature: signature || undefined, source: "webhook", razorpayPayload: payload });
        if (activated.ok) {
          await updateWebhookLogBestEffort({ admin: admin.data, enabled: webhookLogAvailable, logId: insertedLogId, patch: { processed: true, processed_at: new Date().toISOString(), notes: `${item.type}_featured_reconciled` }, eventType, eventId });
          return NextResponse.json({ ok: true, reconciled: `${item.type}_featured_order` });
        }
      }
    }


    const courseOrderLookupClauses = [`razorpay_order_id.eq.${razorpayOrderId}`];
    if (noteCourseOrderId) courseOrderLookupClauses.push(`id.eq.${noteCourseOrderId}`);
    else if (noteOrderId) courseOrderLookupClauses.push(`id.eq.${noteOrderId}`);

    const { data: courseOrder, error: courseOrderError } = await admin.data
      .from("course_orders")
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status,razorpay_order_id")
      .or(courseOrderLookupClauses.join(","))
      .limit(1)
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
              order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.course,
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

        await updateWebhookLogBestEffort({
          admin: admin.data,
          enabled: webhookLogAvailable,
          logId: insertedLogId,
          patch: { processed: true, processed_at: new Date().toISOString(), notes: "course_order_marked_failed" },
          eventType,
          eventId,
        });
        console.warn("[razorpay/webhook] exit failure event", { ...courseLogCtx, final_decision: "course_order_failed" });
        return NextResponse.json({ ok: true, reconciled: "course_order_failed" });
      }

      if (isPaidEvent) {
        const eventAmount = Number(paymentEntity?.amount ?? orderEntity?.amount_paid ?? 0);
        const expectedAmount = Math.round(Number(courseOrder.gross_amount ?? 0) * 100);
        const eventCurrency = String(paymentEntity?.currency ?? orderEntity?.currency ?? "").toUpperCase();
        const expectedCurrency = String(courseOrder.currency ?? "").toUpperCase();

        if (eventAmount && (eventAmount !== expectedAmount || !eventCurrency || eventCurrency !== expectedCurrency)) {
          await updateWebhookLogBestEffort({
            admin: admin.data,
            enabled: webhookLogAvailable,
            logId: insertedLogId,
            patch: {
              processed: true,
              processed_at: new Date().toISOString(),
              notes: `course_amount_currency_mismatch:${eventAmount}:${eventCurrency}`,
            },
            eventType,
            eventId,
          });
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

        const finalized = await finalizeCoursePaymentFromRazorpay({
          supabase: admin.data,
          razorpayOrderId: courseOrder.razorpay_order_id ?? razorpayOrderId,
          razorpayPaymentId,
          razorpayStatus: paymentStatus ?? "captured",
          razorpaySignature: signature || undefined,
          source: "webhook",
          gatewayResponse: { webhookEventType: eventType, paymentStatus: paymentStatus ?? null },
        });

        if (finalized.error) {
          console.error("[razorpay/webhook] course reconciliation failed", {
            order_id: razorpayOrderId,
            razorpay_order_id: razorpayOrderId,
            payment_id: razorpayPaymentId,
            course_order_id: courseOrder.id,
            error: finalized.error,
          });
          await updateWebhookLogBestEffort({
            admin: admin.data,
            enabled: webhookLogAvailable,
            logId: insertedLogId,
            patch: { notes: `course_reconcile_failed:${finalized.error}` },
            eventType,
            eventId,
          });
          return NextResponse.json({ ok: false, code: "COURSE_RECONCILE_FAILED", error: finalized.error }, { status: 202 });
        }

        await updateWebhookLogBestEffort({
          admin: admin.data,
          enabled: webhookLogAvailable,
          logId: insertedLogId,
          patch: { processed: true, processed_at: new Date().toISOString(), notes: "course_order_reconciled" },
          eventType,
          eventId,
        });

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

    const psychometricLookupClauses = [`razorpay_order_id.eq.${razorpayOrderId}`];
    if (notePsychometricOrderId) psychometricLookupClauses.push(`id.eq.${notePsychometricOrderId}`);
    else if (noteOrderId) psychometricLookupClauses.push(`id.eq.${noteOrderId}`);

    const { data: psychometricOrder, error: psychometricOrderError } = await admin.data
      .from("psychometric_orders")
      .select("id,user_id,test_id,final_amount,currency,payment_status,razorpay_order_id,razorpay_payment_id")
      .or(psychometricLookupClauses.join(","))
      .limit(1)
      .maybeSingle();

    if (psychometricOrderError) {
      console.warn("[razorpay/webhook] psychometric order lookup skipped after db error", {
        eventType,
        eventId,
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        db_error: psychometricOrderError.message,
      });
    }

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

      const finalized = await finalizePaidPsychometricOrder({ supabase: admin.data, psychometricOrderId: psychometricOrder.id, source: "webhook" });
      if (finalized.error) return NextResponse.json({ ok: false, code: "PSYCHOMETRIC_FINALIZE_FAILED", error: finalized.error }, { status: 202 });

      await updateWebhookLogBestEffort({
        admin: admin.data,
        enabled: webhookLogAvailable,
        logId: insertedLogId,
        patch: { processed: true, processed_at: new Date().toISOString(), notes: "psychometric_order_reconciled" },
        eventType,
        eventId,
      });

      return NextResponse.json({ ok: true, reconciled: "psychometric_order" });
    }

    if (psychometricOrder && isPaidEvent && !razorpayPaymentId) {
      const razorpay = getRazorpayClient();
      if (razorpay.ok) {
        try {
          const paymentList = (await razorpay.data.orders.fetchPayments(razorpayOrderId)) as { items?: Array<{ id?: string; status?: string }> };
          const capturedPayment = (paymentList.items ?? []).find((item) => String(item.status ?? "").toLowerCase() === "captured" && item.id);
          razorpayPaymentId = capturedPayment?.id ?? null;
        } catch (error) {
          console.warn("[razorpay/webhook] unable to fetch psychometric payment id", {
            razorpayOrderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const webinarOrderLookupClauses = [`razorpay_order_id.eq.${razorpayOrderId}`];
    if (noteWebinarOrderId) webinarOrderLookupClauses.push(`id.eq.${noteWebinarOrderId}`);
    else if (noteOrderId) webinarOrderLookupClauses.push(`id.eq.${noteOrderId}`);

    const { data: webinarOrder, error: webinarOrderError } = await admin.data
      .from("webinar_orders")
      .select("id,webinar_id,student_id,institute_id,amount,currency,payment_status,order_status,access_status,razorpay_order_id")
      .or(webinarOrderLookupClauses.join(","))
      .limit(1)
      .maybeSingle();

    if (webinarOrderError) {
      console.warn("[razorpay/webhook] webinar order lookup skipped after db error", {
        eventType,
        eventId,
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
        db_error: webinarOrderError.message,
      });
    }

    if (webinarOrder && isPaidEvent && !razorpayPaymentId) {
      const razorpay = getRazorpayClient();
      if (razorpay.ok) {
        try {
          const paymentList = (await razorpay.data.orders.fetchPayments(razorpayOrderId)) as { items?: Array<{ id?: string; status?: string }> };
          const capturedPayment = (paymentList.items ?? []).find((item) => String(item.status ?? "").toLowerCase() === "captured" && item.id);
          razorpayPaymentId = capturedPayment?.id ?? null;
        } catch (error) {
          console.warn("[razorpay/webhook] unable to fetch webinar payment id", {
            razorpayOrderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (webinarOrder && isPaidEvent && razorpayPaymentId) {
      const finalized = await finalizeWebinarPaymentFromRazorpay({
        supabase: admin.data,
        razorpayOrderId: webinarOrder.razorpay_order_id ?? razorpayOrderId,
        razorpayPaymentId,
        razorpayStatus: paymentStatus ?? "captured",
        razorpaySignature: signature || undefined,
        source: "webhook",
        paymentEventType: eventType,
      });

      if (finalized.error) {
        return NextResponse.json({ ok: false, code: "WEBINAR_RECONCILE_FAILED", error: finalized.error }, { status: 202 });
      }

      await updateWebhookLogBestEffort({
        admin: admin.data,
        enabled: webhookLogAvailable,
        logId: insertedLogId,
        patch: { processed: true, processed_at: new Date().toISOString(), notes: "webinar_order_reconciled" },
        eventType,
        eventId,
      });

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
