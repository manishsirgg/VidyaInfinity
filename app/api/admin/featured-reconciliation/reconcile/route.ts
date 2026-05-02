import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder, fetchRazorpayPaymentForOrder, type FeaturedOrderType } from "@/lib/featured-reconciliation";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const body = (await request.json()) as { orderType: FeaturedOrderType; orderId: string; razorpayOrderId: string };
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const fetched = await fetchRazorpayPaymentForOrder(body.razorpayOrderId);
  if (!fetched.ok) return NextResponse.json({ error: fetched.error }, { status: 502 });
  if (!fetched.paymentId) return NextResponse.json({ ok: true, status: "pending" });
  const act = await activateFeaturedSubscriptionFromPaidOrder({ supabase: admin.data, orderType: body.orderType, orderId: body.orderId, razorpayOrderId: body.razorpayOrderId, razorpayPaymentId: fetched.paymentId, source: "admin_reconciliation", actorUserId: auth.user.id });
  if (!act.ok) return NextResponse.json({ error: act.error }, { status: 500 });
  return NextResponse.json({ ok: true, status: "paid_reconciled" });
}
