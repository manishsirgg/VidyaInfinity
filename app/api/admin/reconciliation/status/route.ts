import { NextRequest, NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { calculateCanonicalPendingInstitutePayouts, calculateNetPlatformFeeRevenue } from "@/lib/admin/finance-summary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reconcileRefundAccessAndOrderState } from "@/lib/payments/refund-reconciliation";

const DUPLICATE_EARNING_THRESHOLD = 1;

function key(sourceType: string, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [
    { data: paidCourseOrders },
    { data: paidWebinarOrders },
    { data: enrollments },
    { data: refundedCourseOrders },
    { data: refundedWebinarOrders },
    { data: webinarRegistrations },
    { data: payoutLedgerRows },
    { data: payoutRequestRows },
    { data: refundRows },
  ] = await Promise.all([
    admin.data.from("course_orders").select("id,payment_status,gross_amount,platform_fee_amount").eq("payment_status", "paid"),
    admin.data.from("webinar_orders").select("id,payment_status,amount,platform_fee_amount"),
    admin.data.from("course_enrollments").select("id,course_order_id,enrollment_status"),
    admin.data.from("course_orders").select("id,payment_status").eq("payment_status", "refunded"),
    admin.data.from("webinar_orders").select("id,payment_status").eq("payment_status", "refunded"),
    admin.data.from("webinar_registrations").select("id,webinar_order_id,registration_status,payment_status,access_status"),
    admin.data.from("institute_payouts").select("id,institute_id,payout_source,payout_amount,payout_status,gross_amount,platform_fee_amount,refund_amount,refund_reference,course_order_id,webinar_order_id,source_reference_type,source_reference_id"),
    admin.data.from("institute_payout_requests").select("id,institute_id,status,requested_amount,approved_amount"),
    admin.data.from("refunds").select("id,refund_status,amount,course_order_id,webinar_order_id"),
  ]);

  const enrollmentsByOrderId = new Map((enrollments ?? []).map((row) => [row.course_order_id ?? "", row]));
  const paidOrdersMissingEnrollment = (paidCourseOrders ?? []).filter((order) => !enrollmentsByOrderId.has(order.id));
  const refundedOrdersActiveEnrollments = (refundedCourseOrders ?? []).filter((order) => {
    const enrollment = enrollmentsByOrderId.get(order.id);
    if (!enrollment) return false;
    return !["cancelled", "canceled", "revoked", "inactive", "refunded"].includes(String(enrollment.enrollment_status ?? "").toLowerCase());
  });

  const registrationsByOrderId = new Map((webinarRegistrations ?? []).map((row) => [row.webinar_order_id ?? "", row]));
  const refundedOrdersActiveRegistrations = (refundedWebinarOrders ?? []).filter((order) => {
    if (String(order.payment_status ?? "").toLowerCase() !== "refunded") return false;
    const registration = registrationsByOrderId.get(order.id);
    if (!registration) return false;
    const registrationStatus = String(registration.registration_status ?? "").toLowerCase();
    const paymentStatus = String(registration.payment_status ?? "").toLowerCase();
    const accessStatus = String(registration.access_status ?? "").toLowerCase();
    return registrationStatus === "registered" || paymentStatus !== "refunded" || !["revoked", "cancelled", "canceled", "refunded"].includes(accessStatus);
  });

  const payoutSummary = calculateCanonicalPendingInstitutePayouts({
    payoutLedgerRows: (payoutLedgerRows ?? []) as Record<string, unknown>[],
    payoutRequestRows: (payoutRequestRows ?? []) as Record<string, unknown>[],
  });

  const sourceCounts = new Map<string, number>();
  const earningRowCounts = new Map<string, number>();
  const refundAdjustmentCounts = new Map<string, number>();

  for (const row of payoutLedgerRows ?? []) {
    const payoutSource = String(row.payout_source ?? "").toLowerCase();
    const courseOrderId = String(row.course_order_id ?? "").trim();
    const webinarOrderId = String(row.webinar_order_id ?? "").trim();
    const sourceType = String(row.source_reference_type ?? "").trim();
    const sourceId = String(row.source_reference_id ?? "").trim();

    if (sourceType && sourceId) {
      const sourceKey = key(sourceType, sourceId);
      sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    }

    if (payoutSource === "refund_adjustment") {
      const refundReference = String(row.refund_reference ?? "").trim();
      const orderId = courseOrderId || webinarOrderId;
      if (refundReference && orderId) {
        const refundKey = key(refundReference, orderId);
        refundAdjustmentCounts.set(refundKey, (refundAdjustmentCounts.get(refundKey) ?? 0) + 1);
      }
      continue;
    }

    if (courseOrderId) {
      const k = key("course_order", courseOrderId);
      earningRowCounts.set(k, (earningRowCounts.get(k) ?? 0) + 1);
    }
    if (webinarOrderId) {
      const k = key("webinar_order", webinarOrderId);
      earningRowCounts.set(k, (earningRowCounts.get(k) ?? 0) + 1);
    }
  }

  const duplicateEarningLedgerRows = Array.from(earningRowCounts.entries()).filter(([, count]) => count > DUPLICATE_EARNING_THRESHOLD);
  const duplicateRefundAdjustments = Array.from(refundAdjustmentCounts.entries()).filter(([, count]) => count > DUPLICATE_EARNING_THRESHOLD);
  const duplicateSourceReferenceRows = Array.from(sourceCounts.entries()).filter(([, count]) => count > DUPLICATE_EARNING_THRESHOLD);

  const courseFee = calculateNetPlatformFeeRevenue({
    paidOrders: (paidCourseOrders ?? []) as Record<string, unknown>[],
    orderIdField: "id",
    grossAmountField: "gross_amount",
    platformFeeField: "platform_fee_amount",
    refunds: ((refundRows ?? []).filter((row) => Boolean(row.course_order_id)) ?? []) as Record<string, unknown>[],
    refundOrderIdField: "course_order_id",
    refundAmountField: "amount",
  });

  const webinarFee = calculateNetPlatformFeeRevenue({
    paidOrders: (paidWebinarOrders ?? []) as Record<string, unknown>[],
    orderIdField: "id",
    grossAmountField: "amount",
    platformFeeField: "platform_fee_amount",
    refunds: ((refundRows ?? []).filter((row) => Boolean(row.webinar_order_id)) ?? []) as Record<string, unknown>[],
    refundOrderIdField: "webinar_order_id",
    refundAmountField: "amount",
  });

  const expectedNetPlatformFee = courseFee.netPlatformFee + webinarFee.netPlatformFee;
  const ledgerPlatformFeeGross = (payoutLedgerRows ?? [])
    .filter((row) => String(row.payout_source ?? "").toLowerCase() !== "refund_adjustment")
    .reduce((sum, row) => sum + Math.max(0, Number(row.platform_fee_amount ?? 0)), 0);
  const platformFeeNotReversedAfterRefund = Math.max(0, Number((ledgerPlatformFeeGross - expectedNetPlatformFee).toFixed(2)));

  return NextResponse.json({
    summary: {
      paid_orders_missing_entitlement: paidOrdersMissingEnrollment.length,
      refunded_orders_with_active_course_entitlement: refundedOrdersActiveEnrollments.length,
      refunded_orders_with_active_webinar_entitlement: refundedOrdersActiveRegistrations.length,
      duplicate_earning_ledger_rows: duplicateEarningLedgerRows.length,
      duplicate_refund_adjustment_rows: duplicateRefundAdjustments.length,
      duplicate_source_reference_rows: duplicateSourceReferenceRows.length,
      dashboard_wallet_mismatch: 0,
      platform_fee_not_reversed_after_refund: platformFeeNotReversedAfterRefund,
      pending_institute_payouts_total: payoutSummary.totalPayable,
      pending_institute_payouts_available: payoutSummary.availablePayable,
      pending_institute_payouts_locked: payoutSummary.lockedPayable,
      pending_institute_payouts_paid_out: payoutSummary.paidOut,
    },
    issues: {
      paid_orders_missing_entitlement: paidOrdersMissingEnrollment.map((row) => row.id),
      refunded_orders_with_active_course_entitlement: refundedOrdersActiveEnrollments.map((row) => row.id),
      refunded_orders_with_active_webinar_entitlement: refundedOrdersActiveRegistrations.map((row) => row.id),
      duplicate_earning_ledger_rows: duplicateEarningLedgerRows,
      duplicate_refund_adjustment_rows: duplicateRefundAdjustments,
      duplicate_source_reference_rows: duplicateSourceReferenceRows,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as { repair?: boolean } | null;
  if (!payload?.repair) {
    return NextResponse.json({ ok: true, message: "No repair executed. Pass { repair: true } to run repair." });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [{ data: refundedCourseOrders }, { data: refundedWebinarOrders }] = await Promise.all([
    admin.data.from("course_orders").select("id,payment_status").eq("payment_status", "refunded"),
    admin.data.from("webinar_orders").select("id,payment_status").eq("payment_status", "refunded"),
  ]);

  for (const row of refundedCourseOrders ?? []) {
    await reconcileRefundAccessAndOrderState({
      supabase: admin.data,
      targets: { course_order_id: row.id, psychometric_order_id: null, webinar_order_id: null },
    });
  }

  for (const row of refundedWebinarOrders ?? []) {
    await reconcileRefundAccessAndOrderState({
      supabase: admin.data,
      targets: { course_order_id: null, psychometric_order_id: null, webinar_order_id: row.id },
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Repair executed for refunded order entitlement states.",
    repaired: {
      course_orders: refundedCourseOrders?.length ?? 0,
      webinar_orders: refundedWebinarOrders?.length ?? 0,
    },
  });
}
