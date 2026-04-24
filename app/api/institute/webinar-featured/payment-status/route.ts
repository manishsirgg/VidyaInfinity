import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Body = {
  orderId?: string;
  event?: "checkout_opened" | "checkout_dismissed" | "payment_failed";
  reason?: string;
  paymentId?: string;
};

type OrderRow = {
  id: string;
  payment_status: string;
  order_status: string;
  metadata: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.orderId || !body.event) return NextResponse.json({ error: "orderId and event are required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const { data: order } = await admin.data
    .from("webinar_featured_orders")
    .select("id,payment_status,order_status,metadata")
    .eq("razorpay_order_id", body.orderId)
    .eq("institute_id", instituteId)
    .maybeSingle<OrderRow>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const existingEvents = Array.isArray(order.metadata?.["checkout_events"]) ? (order.metadata["checkout_events"] as unknown[]) : [];
  const metadata = {
    ...(order.metadata ?? {}),
    checkout_events: [
      ...existingEvents,
      {
        event: body.event,
        reason: body.reason ?? null,
        paymentId: body.paymentId ?? null,
        at: nowIso,
      },
    ],
    last_checkout_event: body.event,
    last_checkout_reason: body.reason ?? null,
    last_checkout_event_at: nowIso,
  };

  const updates: Record<string, unknown> = { metadata, updated_at: nowIso };
  if (body.event === "payment_failed" && order.payment_status !== "paid") {
    updates.payment_status = "failed";
    if (order.order_status !== "cancelled") updates.order_status = "failed";
    if (typeof body.paymentId === "string" && body.paymentId.length > 0) updates.razorpay_payment_id = body.paymentId;
  }

  const { error: updateError } = await admin.data.from("webinar_featured_orders").update(updates).eq("id", order.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim();
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const { data: order } = await admin.data
    .from("webinar_featured_orders")
    .select("id,payment_status,order_status,paid_at,razorpay_order_id,razorpay_payment_id")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", instituteId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  return NextResponse.json({ ok: true, order });
}
