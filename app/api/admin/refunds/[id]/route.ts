import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { applyRefundToInstitutePayout } from "@/lib/payments/institute-payout-refunds";
import { createRazorpayRefund, mapRazorpayRefundStatus } from "@/lib/payments/refunds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RefundDbStatus = "requested" | "processing" | "refunded" | "failed" | "cancelled";

type RefundAction = "processing" | "cancelled";

const ALLOWED_NEXT_STATUS: Record<RefundDbStatus, RefundDbStatus[]> = {
  requested: ["processing", "cancelled"],
  processing: [],
  refunded: [],
  failed: [],
  cancelled: [],
};

function toUiLabel(status: RefundDbStatus) {
  if (status === "processing") return "Processing";
  if (status === "refunded") return "Refunded";
  if (status === "cancelled") return "Cancelled";
  if (status === "failed") return "Failed";
  return "Requested";
}



function logRefundAdminEvent(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, adminNote } = (await request.json()) as { status?: string; adminNote?: string | null };

  if (!status || !["processing", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Invalid status action" }, { status: 400 });
  }

  const requestedStatus = status as RefundAction;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: currentRefund, error: fetchError } = await admin.data
    .from("refunds")
    .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id,amount,razorpay_payment_id,razorpay_refund_id,metadata")
    .eq("id", id)
    .single();

  if (fetchError || !currentRefund) {
    return NextResponse.json({ error: fetchError?.message ?? "Refund not found" }, { status: 404 });
  }

  const currentStatus = currentRefund.refund_status as RefundDbStatus;
  if (currentStatus !== requestedStatus && !ALLOWED_NEXT_STATUS[currentStatus]?.includes(requestedStatus)) {
    return NextResponse.json(
      {
        error: `Cannot move refund from ${currentStatus} to ${requestedStatus}. Allowed: ${ALLOWED_NEXT_STATUS[currentStatus]?.join(", ") || "none"}`,
      },
      { status: 400 },
    );
  }

  logRefundAdminEvent("refund_admin_action_started", {
    refundId: id,
    currentStatus,
    requestedStatus,
    adminUserId: auth.user.id,
  });

  if (requestedStatus === "cancelled") {
    const { data: cancelledRefund, error: cancelError } = await admin.data
      .from("refunds")
      .update({
        refund_status: "cancelled",
        internal_notes: adminNote ?? null,
        metadata: {
          ...(currentRefund.metadata ?? {}),
          cancelled_by: auth.user.id,
          cancelled_at: new Date().toISOString(),
        },
      })
      .eq("id", id)
      .eq("refund_status", "requested")
      .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id")
      .single();

    if (cancelError || !cancelledRefund) {
      return NextResponse.json({ error: cancelError?.message ?? "Unable to cancel refund" }, { status: 409 });
    }

    logRefundAdminEvent("refund_admin_action_rejected", {
      refundId: id,
      adminUserId: auth.user.id,
      nextStatus: "cancelled",
    });

    await createAccountNotification({
      userId: cancelledRefund.user_id,
      type: "refund",
      category: "refund",
      priority: "normal",
      title: "Refund update",
      message: `Your refund request is now ${toUiLabel("cancelled")}.`,
      targetUrl: "/student/purchases",
      actionLabel: "View purchases",
      entityType: "refund",
      entityId: cancelledRefund.id,
      dedupeKey: `refund:${cancelledRefund.id}:cancelled`,
      metadata: { refundStatus: "cancelled" },
    }).catch(() => undefined);

    await writeAdminAuditLog({
      adminUserId: auth.user.id,
      action: "REFUND_REJECTED",
      targetTable: "refunds",
      targetId: cancelledRefund.id,
      metadata: { refundStatus: "cancelled", note: adminNote ?? null },
    });

    logRefundAdminEvent("refund_admin_action_completed", {
      refundId: id,
      adminUserId: auth.user.id,
      finalStatus: "cancelled",
    });

    return NextResponse.json({
      ok: true,
      message: "Refund request was rejected and marked as cancelled.",
      refund: cancelledRefund,
    });
  }

  if (!currentRefund.razorpay_payment_id) {
    const { data: failedRefund } = await admin.data
      .from("refunds")
      .update({
        refund_status: "failed",
        internal_notes: adminNote ?? "Missing Razorpay payment id",
        failed_at: new Date().toISOString(),
        metadata: {
          ...(currentRefund.metadata ?? {}),
          failure_reason: "missing_razorpay_payment_id",
          failed_by: auth.user.id,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", id)
      .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id")
      .single();

    logRefundAdminEvent("razorpay_refund_request_failed", {
      refundId: id,
      adminUserId: auth.user.id,
      reason: "missing_razorpay_payment_id",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Refund failed: missing Razorpay payment id",
        refund: failedRefund,
      },
      { status: 400 },
    );
  }

  const requestAmount = Number(currentRefund.amount ?? 0);
  if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
    const failureReason = `Invalid refund amount: ${currentRefund.amount}`;
    const { data: failedRefund } = await admin.data
      .from("refunds")
      .update({
        refund_status: "failed",
        failed_at: new Date().toISOString(),
        internal_notes: adminNote ?? failureReason,
        metadata: {
          ...(currentRefund.metadata ?? {}),
          failure_reason: failureReason,
          failed_at: new Date().toISOString(),
          failed_by: auth.user.id,
        },
      })
      .eq("id", id)
      .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id")
      .single();

    logRefundAdminEvent("razorpay_refund_request_failed", {
      refundId: id,
      adminUserId: auth.user.id,
      reason: failureReason,
    });

    return NextResponse.json({ ok: false, error: failureReason, refund: failedRefund }, { status: 400 });
  }

  logRefundAdminEvent("razorpay_refund_request_sent", {
    refundId: id,
    adminUserId: auth.user.id,
    paymentId: currentRefund.razorpay_payment_id,
    amount: requestAmount,
  });

  const razorpayRefund = await createRazorpayRefund({
    paymentId: currentRefund.razorpay_payment_id,
    amount: requestAmount,
    receipt: `refund_${currentRefund.id}`,
    notes: {
      refund_id: currentRefund.id,
      source: "admin_approval",
    },
  });

  if (!razorpayRefund.ok) {
    const { data: failedRefund } = await admin.data
      .from("refunds")
      .update({
        refund_status: "failed",
        failed_at: new Date().toISOString(),
        internal_notes: adminNote ?? razorpayRefund.error,
        metadata: {
          ...(currentRefund.metadata ?? {}),
          failure_reason: razorpayRefund.error,
          failed_at: new Date().toISOString(),
          failed_by: auth.user.id,
        },
      })
      .eq("id", id)
      .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id")
      .single();

    logRefundAdminEvent("razorpay_refund_request_failed", {
      refundId: id,
      adminUserId: auth.user.id,
      reason: razorpayRefund.error,
    });

    return NextResponse.json({ ok: false, error: razorpayRefund.error, refund: failedRefund }, { status: 502 });
  }

  logRefundAdminEvent("razorpay_refund_request_succeeded", {
    refundId: id,
    adminUserId: auth.user.id,
    razorpayRefundId: razorpayRefund.data.id,
    razorpayStatus: razorpayRefund.data.status ?? "unknown",
  });

  const latestRazorpayRefundCreatedAt = razorpayRefund.data.created_at ?? null;
  const mappedStatus = mapRazorpayRefundStatus(razorpayRefund.data.status);
  const finalStatus: RefundDbStatus = mappedStatus === "processing" ? "processing" : mappedStatus;

  const { data: refund, error: updateError } = await admin.data
    .from("refunds")
    .update({
      refund_status: finalStatus,
      razorpay_refund_id: razorpayRefund.data.id,
      internal_notes: adminNote ?? null,
      processed_at: new Date().toISOString(),
      failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
      metadata: {
        ...(currentRefund.metadata ?? {}),
        approved_by: auth.user.id,
        approved_at: new Date().toISOString(),
        razorpay_refund_status: razorpayRefund.data.status ?? "unknown",
        razorpay_refund_amount_subunits: razorpayRefund.data.amount ?? null,
        razorpay_refund_created_at: latestRazorpayRefundCreatedAt,
        razorpay_refund_payment_id: razorpayRefund.data.payment_id ?? currentRefund.razorpay_payment_id,
      },
    })
    .eq("id", id)
    .eq("refund_status", "requested")
    .select("id,refund_status,course_order_id,psychometric_order_id,webinar_order_id,user_id")
    .single();

  if (updateError || !refund) return NextResponse.json({ error: updateError?.message ?? "Unable to update refund" }, { status: 500 });

  logRefundAdminEvent("refund_status_updated_processing", {
    refundId: id,
    adminUserId: auth.user.id,
    finalStatus: refund.refund_status,
    razorpayRefundId: razorpayRefund.data.id,
  });

  let payoutSyncWarning: string | null = null;

  if (refund.refund_status === "refunded") {
    if (refund.course_order_id) {
      await admin.data
        .from("course_orders")
        .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", refund.course_order_id);
    }

    if (refund.psychometric_order_id) {
      await admin.data
        .from("psychometric_orders")
        .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", refund.psychometric_order_id);
    }

    if (refund.webinar_order_id) {
      await admin.data
        .from("webinar_orders")
        .update({ payment_status: "refunded", order_status: "refunded", access_status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", refund.webinar_order_id);

      await admin.data
        .from("webinar_registrations")
        .update({
          payment_status: "refunded",
          access_status: "revoked",
          access_end_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("webinar_order_id", refund.webinar_order_id);
    }

    const payoutOrderKind = refund.course_order_id ? "course_order" : refund.webinar_order_id ? "webinar_order" : null;
    const payoutOrderId = refund.course_order_id ?? refund.webinar_order_id;

    if (payoutOrderKind && payoutOrderId) {
      const payoutRefundResult = await applyRefundToInstitutePayout(admin.data, {
        orderKind: payoutOrderKind,
        orderId: payoutOrderId,
        refundAmount: requestAmount,
        refundReference: razorpayRefund.data.id ?? refund.id,
      });

      if (!payoutRefundResult.ok) {
        payoutSyncWarning = payoutRefundResult.error;
        logRefundAdminEvent("refund_wallet_adjustment_failed", {
          refundId: refund.id,
          orderKind: payoutOrderKind,
          orderId: payoutOrderId,
          reason: payoutRefundResult.error,
        });
      } else {
        logRefundAdminEvent("refund_wallet_adjustment_applied", {
          refundId: refund.id,
          orderKind: payoutOrderKind,
          orderId: payoutOrderId,
        });
      }
    }
  }

  await createAccountNotification({
    userId: refund.user_id,
    type: "refund",
    category: "refund",
    priority: refund.refund_status === "refunded" ? "high" : "normal",
    title: "Refund update",
    message: `Your refund request is now ${toUiLabel(refund.refund_status as RefundDbStatus)}.`,
    targetUrl: "/student/purchases",
    actionLabel: "View purchases",
    entityType: "refund",
    entityId: refund.id,
    dedupeKey: `refund:${refund.id}:${refund.refund_status}`,
    metadata: {
      refundStatus: refund.refund_status,
      courseOrderId: refund.course_order_id,
      psychometricOrderId: refund.psychometric_order_id,
      webinarOrderId: refund.webinar_order_id,
    },
  }).catch(() => undefined);

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "REFUND_APPROVED",
    targetTable: "refunds",
    targetId: refund.id,
    metadata: {
      refundStatus: refund.refund_status,
      courseOrderId: refund.course_order_id,
      psychometricOrderId: refund.psychometric_order_id,
      webinarOrderId: refund.webinar_order_id,
    },
  });

  logRefundAdminEvent("refund_admin_action_completed", {
    refundId: id,
    adminUserId: auth.user.id,
    finalStatus: refund.refund_status,
  });

  return NextResponse.json({
    ok: true,
    message:
      refund.refund_status === "refunded"
        ? "Refund was successfully processed."
        : "Refund initiation succeeded and is now processing.",
    warning: payoutSyncWarning,
    refund,
  });
}
