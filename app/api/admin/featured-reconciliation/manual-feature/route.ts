import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { activateFeaturedSubscriptionFromPaidOrder, type FeaturedOrderType } from "@/lib/featured-reconciliation";
export async function POST(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const body = (await request.json()) as { orderType: FeaturedOrderType; orderId: string; reason: string };
  if (!body.reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const act = await activateFeaturedSubscriptionFromPaidOrder({ supabase: admin.data, orderType: body.orderType, orderId: body.orderId, source: "manual_admin_grant", actorUserId: auth.user.id, reason: body.reason });
  if (!act.ok) return NextResponse.json({ error: act.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
