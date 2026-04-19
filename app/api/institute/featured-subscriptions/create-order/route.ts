import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanRow = Record<string, unknown>;

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { planId } = (await request.json()) as { planId?: string };
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data
    .from("institutes")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!institute) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const { data: plan, error: planError } = await admin.data
    .from("featured_listing_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle<PlanRow>();

  if (planError || !plan) return NextResponse.json({ error: "Featured plan not found" }, { status: 404 });

  const price = toNumber(plan.price ?? plan.amount);
  const durationDays = toNumber(plan.duration_days);
  const currency = typeof plan.currency === "string" && plan.currency ? plan.currency : "INR";

  if (price <= 0 || durationDays <= 0) {
    return NextResponse.json({ error: "Invalid featured plan configuration" }, { status: 400 });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  const receipt = `featured_${String(planId).slice(0, 8)}_${Date.now()}`;
  const order = await razorpay.data.orders.create({
    amount: Math.round(price * 100),
    currency,
    receipt,
    notes: {
      instituteId: institute.id,
      userId: auth.user.id,
      planId,
      productType: "featured_listing_subscription",
    },
  });

  const { data: insertedOrder, error: insertError } = await admin.data
    .from("featured_listing_orders")
    .insert({
      institute_id: institute.id,
      created_by: auth.user.id,
      plan_id: planId,
      amount: price,
      currency,
      duration_days: durationDays,
      payment_status: "pending",
      order_status: "pending",
      razorpay_order_id: order.id,
      razorpay_receipt: order.receipt ?? receipt,
      metadata: { source: "featured_create_order_api" },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ order, orderRecordId: insertedOrder.id, plan: { id: planId, price, currency, durationDays } });
}
