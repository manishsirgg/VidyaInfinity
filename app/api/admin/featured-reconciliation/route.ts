import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const [inst, course, webinar] = await Promise.all([
    admin.data.from("featured_listing_orders").select("id,institute_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("course_featured_orders").select("id,institute_id,course_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("webinar_featured_orders").select("id,institute_id,webinar_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const instituteOrders = inst.data ?? [];
  const paidConfirmedInstituteOrderIds = instituteOrders
    .filter((row) => row.payment_status === "paid" && row.order_status === "confirmed")
    .map((row) => row.id);
  const { data: instituteSubs } = paidConfirmedInstituteOrderIds.length
    ? await admin.data.from("institute_featured_subscriptions").select("order_id").in("order_id", paidConfirmedInstituteOrderIds)
    : { data: [] as Array<{ order_id: string | null }> };
  const subOrderIds = new Set((instituteSubs ?? []).map((row) => row.order_id).filter((v): v is string => Boolean(v)));
  const markedInstituteOrders = instituteOrders.map((row) => ({
    ...row,
    missing_subscription: row.payment_status === "paid" && row.order_status === "confirmed" ? !subOrderIds.has(row.id) : false,
    issue_label: row.payment_status === "paid" && row.order_status === "confirmed" && !subOrderIds.has(row.id) ? "Paid institute featured order missing subscription" : null,
    recommended_action: row.payment_status === "paid" && row.order_status === "confirmed" && !subOrderIds.has(row.id) ? "Create missing active subscription" : null,
  }));
  return NextResponse.json({ instituteOrders: markedInstituteOrders, courseOrders: course.data ?? [], webinarOrders: webinar.data ?? [] });
}
