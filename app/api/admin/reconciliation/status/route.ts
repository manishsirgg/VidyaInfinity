import { NextRequest, NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { calculateCanonicalPendingInstitutePayouts } from "@/lib/admin/finance-summary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reconcileRefundAccessAndOrderState } from "@/lib/payments/refund-reconciliation";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [{ data: paidCourseOrders }, { data: enrollments }, { data: refundedCourseOrders }, { data: refundedWebinarOrders }, { data: webinarRegistrations }, { data: payoutLedgerRows }, { data: payoutRequestRows }] = await Promise.all([
    admin.data.from("course_orders").select("id,payment_status").eq("payment_status", "paid"),
    admin.data.from("course_enrollments").select("id,course_order_id,enrollment_status"),
    admin.data.from("course_orders").select("id,payment_status").eq("payment_status", "refunded"),
    admin.data.from("webinar_orders").select("id,payment_status"),
    admin.data.from("webinar_registrations").select("id,webinar_order_id,registration_status,payment_status,access_status"),
    admin.data.from("institute_payouts").select("id,institute_id,payout_source,payout_amount,payout_status,gross_amount,platform_fee_amount,refund_amount"),
    admin.data.from("institute_payout_requests").select("id,institute_id,status,requested_amount,approved_amount"),
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

  return NextResponse.json({
    summary: {
      paid_orders_missing_entitlement: paidOrdersMissingEnrollment.length,
      refunded_orders_with_active_course_entitlement: refundedOrdersActiveEnrollments.length,
      refunded_orders_with_active_webinar_entitlement: refundedOrdersActiveRegistrations.length,
      pending_institute_payouts_total: payoutSummary.totalPayable,
      pending_institute_payouts_available: payoutSummary.availablePayable,
      pending_institute_payouts_locked: payoutSummary.lockedPayable,
    },
    issues: {
      paid_orders_missing_entitlement: paidOrdersMissingEnrollment.map((row) => row.id),
      refunded_orders_with_active_course_entitlement: refundedOrdersActiveEnrollments.map((row) => row.id),
      refunded_orders_with_active_webinar_entitlement: refundedOrdersActiveRegistrations.map((row) => row.id),
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
