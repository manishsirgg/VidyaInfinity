import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_NEXT_STATUS: Record<string, string[]> = {
  requested: ["approved", "rejected"],
  approved: ["processed", "rejected"],
  rejected: [],
  processed: [],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { status, adminNote } = await request.json();

  if (!["requested", "approved", "rejected", "processed"].includes(status)) {
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

  if (currentRefund.refund_status !== status && !ALLOWED_NEXT_STATUS[currentRefund.refund_status]?.includes(status)) {
    return NextResponse.json(
      {
        error: `Cannot move refund from ${currentRefund.refund_status} to ${status}. Allowed: ${
          ALLOWED_NEXT_STATUS[currentRefund.refund_status]?.join(", ") || "none"
        }`,
      },
      { status: 400 },
    );
  }

  const { data: refund, error } = await admin.data
    .from("refunds")
    .update({
      refund_status: status,
      internal_notes: adminNote ?? null,
      processed_at: status === "processed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id,refund_status,course_order_id,psychometric_order_id,user_id")
    .single();

  if (error || !refund) return NextResponse.json({ error: error?.message ?? "Refund not found" }, { status: 500 });

  if (status === "processed") {
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
    priority: status === "processed" ? "high" : "normal",
    title: "Refund update",
    message: `Your refund request is now ${status}.`,
    targetUrl: "/student/purchases",
    actionLabel: "View purchases",
    entityType: "refund",
    entityId: refund.id,
    dedupeKey: `refund:${refund.id}:${status}`,
    metadata: { refundStatus: status, courseOrderId: refund.course_order_id, psychometricOrderId: refund.psychometric_order_id },
  }).catch(() => undefined);

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "REFUND_STATUS_UPDATED",
    targetTable: "refunds",
    targetId: refund.id,
    metadata: { refundStatus: status, courseOrderId: refund.course_order_id, psychometricOrderId: refund.psychometric_order_id },
  });

  return NextResponse.json({ ok: true, refund });
}
