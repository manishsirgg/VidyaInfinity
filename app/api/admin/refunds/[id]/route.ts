import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RefundDbStatus = "requested" | "processing" | "refunded" | "failed" | "cancelled";
type RefundLegacyStatus = "approved" | "processed" | "rejected" | "reject";
type RefundStatusInput = RefundDbStatus | RefundLegacyStatus;

const ALLOWED_NEXT_STATUS: Record<RefundDbStatus, RefundDbStatus[]> = {
  requested: ["processing", "cancelled", "failed"],
  processing: ["refunded", "cancelled", "failed"],
  refunded: [],
  failed: [],
  cancelled: [],
};

function toDbStatus(status: RefundStatusInput): RefundDbStatus {
  if (status === "approved") return "processing";
  if (status === "processed") return "refunded";
  if (status === "rejected" || status === "reject") return "cancelled";
  return status;
}

function toUiLabel(status: RefundDbStatus) {
  if (status === "processing") return "Approved";
  if (status === "refunded") return "Processed";
  if (status === "cancelled") return "Rejected";
  if (status === "failed") return "Failed";
  return "Requested";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, adminNote } = (await request.json()) as { status?: string; adminNote?: string | null };

  if (!status || !["requested", "processing", "refunded", "failed", "cancelled", "approved", "processed", "rejected", "reject"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: currentRefund, error: fetchError } = await admin.data
    .from("refunds")
    .select("id,refund_status,course_order_id,psychometric_order_id,user_id")
    .eq("id", id)
    .single();

  if (fetchError || !currentRefund) {
    return NextResponse.json({ error: fetchError?.message ?? "Refund not found" }, { status: 404 });
  }

  const requestedStatus = toDbStatus(status as RefundStatusInput);
  const currentStatus = toDbStatus(currentRefund.refund_status as RefundStatusInput);

  if (currentStatus !== requestedStatus && !ALLOWED_NEXT_STATUS[currentStatus]?.includes(requestedStatus)) {
    return NextResponse.json(
      {
        error: `Cannot move refund from ${currentStatus} to ${requestedStatus}. Allowed: ${ALLOWED_NEXT_STATUS[currentStatus]?.join(", ") || "none"}`,
      },
      { status: 400 },
    );
  }

  const refundPatch = {
    refund_status: requestedStatus,
    internal_notes: adminNote ?? null,
    processed_at: requestedStatus === "refunded" ? new Date().toISOString() : null,
  };

  const { data: refund, error } = await admin.data
    .from("refunds")
    .update(refundPatch)
    .eq("id", id)
    .select("id,refund_status,course_order_id,psychometric_order_id,user_id")
    .single();

  if (error || !refund) return NextResponse.json({ error: error?.message ?? "Refund not found" }, { status: 500 });

  if (requestedStatus === "refunded") {
    if (refund.course_order_id) {
      const { error: orderError } = await admin.data
        .from("course_orders")
        .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", refund.course_order_id);
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    if (refund.psychometric_order_id) {
      const { error: orderError } = await admin.data
        .from("psychometric_orders")
        .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", refund.psychometric_order_id);
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
  }

  await createAccountNotification({
    userId: refund.user_id,
    type: "refund",
    category: "refund",
    priority: requestedStatus === "refunded" ? "high" : "normal",
    title: "Refund update",
    message: `Your refund request is now ${toUiLabel(requestedStatus)}.`,
    targetUrl: "/student/purchases",
    actionLabel: "View purchases",
    entityType: "refund",
    entityId: refund.id,
    dedupeKey: `refund:${refund.id}:${requestedStatus}`,
    metadata: { refundStatus: requestedStatus, courseOrderId: refund.course_order_id, psychometricOrderId: refund.psychometric_order_id },
  }).catch(() => undefined);

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "REFUND_STATUS_UPDATED",
    targetTable: "refunds",
    targetId: refund.id,
    metadata: { refundStatus: requestedStatus, courseOrderId: refund.course_order_id, psychometricOrderId: refund.psychometric_order_id },
  });

  return NextResponse.json({ ok: true, refund });
}
