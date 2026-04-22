import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: refunds, error } = await admin.data
    .from("refunds")
    .select(
      "id,user_id,order_kind,course_order_id,psychometric_order_id,webinar_order_id,reason,internal_notes,refund_status,amount,requested_at,processed_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!refunds?.length) return NextResponse.json({ refunds: [] });

  const userIds = [...new Set(refunds.map((refund) => refund.user_id).filter((value): value is string => Boolean(value)))];
  const courseOrderIds = [...new Set(refunds.map((refund) => refund.course_order_id).filter((value): value is string => Boolean(value)))];
  const psychometricOrderIds = [
    ...new Set(refunds.map((refund) => refund.psychometric_order_id).filter((value): value is string => Boolean(value))),
  ];
  const webinarOrderIds = [...new Set(refunds.map((refund) => refund.webinar_order_id).filter((value): value is string => Boolean(value)))];

  const [profilesResult, courseOrdersResult, psychometricOrdersResult, webinarOrdersResult] = await Promise.all([
    userIds.length
      ? admin.data.from("profiles").select("id,full_name,email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    courseOrderIds.length
      ? admin.data.from("course_orders").select("id,gross_amount,currency,payment_status,paid_at").in("id", courseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    psychometricOrderIds.length
      ? admin.data.from("psychometric_orders").select("id,final_paid_amount,currency,payment_status,paid_at").in("id", psychometricOrderIds)
      : Promise.resolve({ data: [], error: null }),
    webinarOrderIds.length
      ? admin.data.from("webinar_orders").select("id,amount,currency,payment_status,paid_at").in("id", webinarOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
  if (courseOrdersResult.error) return NextResponse.json({ error: courseOrdersResult.error.message }, { status: 500 });
  if (psychometricOrdersResult.error) return NextResponse.json({ error: psychometricOrdersResult.error.message }, { status: 500 });
  if (webinarOrdersResult.error) return NextResponse.json({ error: webinarOrdersResult.error.message }, { status: 500 });

  const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const courseOrdersById = new Map((courseOrdersResult.data ?? []).map((order) => [order.id, order]));
  const psychometricOrdersById = new Map((psychometricOrdersResult.data ?? []).map((order) => [order.id, order]));
  const webinarOrdersById = new Map((webinarOrdersResult.data ?? []).map((order) => [order.id, order]));

  const enrichedRefunds = refunds.map((refund) => ({
    ...refund,
    user: profilesById.get(refund.user_id) ?? null,
    order: (() => {
      if (refund.order_kind === "course_enrollment") {
        const order = refund.course_order_id ? courseOrdersById.get(refund.course_order_id) ?? null : null;
        return order
          ? {
              ...order,
              final_paid_amount: Number(order.gross_amount ?? 0),
            }
          : null;
      }

      if (refund.order_kind === "psychometric_test") {
        return refund.psychometric_order_id ? psychometricOrdersById.get(refund.psychometric_order_id) ?? null : null;
      }

      return refund.webinar_order_id ? webinarOrdersById.get(refund.webinar_order_id) ?? null : null;
    })(),
  }));

  return NextResponse.json({ refunds: enrichedRefunds });
}
