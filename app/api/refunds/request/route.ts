import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { orderType, orderId, reason } = await request.json();
  if (!["course", "psychometric"].includes(orderType) || !orderId || !reason) {
    return NextResponse.json({ error: "orderType, orderId, reason are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  if (orderType === "course") {
    const { data: order } = await admin.data
      .from("course_orders")
      .select("id")
      .eq("id", orderId)
      .eq("user_id", auth.user.id)
      .eq("payment_status", "paid")
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Eligible course order not found" }, { status: 404 });
  } else {
    const { data: order } = await admin.data
      .from("psychometric_orders")
      .select("id")
      .eq("id", orderId)
      .eq("user_id", auth.user.id)
      .eq("payment_status", "paid")
      .maybeSingle();

    if (!order) return NextResponse.json({ error: "Eligible psychometric order not found" }, { status: 404 });
  }

  const { error } = await admin.data.from("refunds").insert({
    user_id: auth.user.id,
    order_type: orderType,
    course_order_id: orderType === "course" ? orderId : null,
    psychometric_order_id: orderType === "psychometric" ? orderId : null,
    reason,
    status: "requested",
    requested_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
