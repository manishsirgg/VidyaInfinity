import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type FeaturedOrderRow = {
  id: string;
  institute_id: string;
  created_by: string;
  plan_id: string;
  amount: number;
  base_amount: number | null;
  credit_adjustment_amount: number | null;
  final_payable_amount: number | null;
  currency: string;
  duration_days: number;
  payment_status: string;
  razorpay_order_id: string;
  is_upgrade: boolean | null;
  auto_renew_requested: boolean | null;
  upgraded_from_subscription_id: string | null;
};

type FeaturedPlanRow = {
  id: string;
  plan_code: string | null;
  code: string | null;
};


function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addDurationDays(baseIso: string, durationDays: number) {
  const start = new Date(baseIso);
  const endMs = start.getTime() + Math.max(0, durationDays) * 24 * 60 * 60 * 1000;
  return new Date(endMs).toISOString();
}

async function getCurrentActiveSubscription(admin: SupabaseClient, instituteId: string) {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("institute_featured_subscriptions")
    .select("id,ends_at,starts_at,order_id")
    .eq("institute_id", instituteId)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function getNextSubscriptionWindow(admin: SupabaseClient, instituteId: string) {
  const nowIso = new Date().toISOString();
  const argVariants: Array<Record<string, unknown>> = [{ p_institute_id: instituteId }, { institute_id: instituteId }];

  for (const args of argVariants) {
    const { data, error } = await admin.rpc("get_next_featured_subscription_window", args);
    if (error) continue;

    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
    if (!row) continue;

    const startAtRaw = row.start_at ?? row.starts_at ?? row.window_start ?? row.next_start_at;
    const startAtIso = typeof startAtRaw === "string" ? startAtRaw : nowIso;
    const shouldQueue = new Date(startAtIso).getTime() > new Date(nowIso).getTime();
    return { startAtIso, shouldQueue };
  }

  const { data: tail } = await admin
    .from("institute_featured_subscriptions")
    .select("ends_at")
    .eq("institute_id", instituteId)
    .in("status", ["active", "scheduled"])
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ ends_at: string }>();

  if (!tail?.ends_at) return { startAtIso: nowIso, shouldQueue: false };
  const shouldQueue = new Date(tail.ends_at).getTime() > new Date(nowIso).getTime();
  return { startAtIso: shouldQueue ? tail.ends_at : nowIso, shouldQueue };
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { orderId, paymentId, signature } = (await request.json()) as {
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "orderId, paymentId, signature are required" }, { status: 400 });
  }

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

  const { data: existingOrder } = await admin.data
    .from("featured_listing_orders")
    .select("id,institute_id,created_by,plan_id,amount,base_amount,credit_adjustment_amount,final_payable_amount,currency,duration_days,payment_status,razorpay_order_id,is_upgrade,auto_renew_requested,upgraded_from_subscription_id")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", institute.id)
    .maybeSingle<FeaturedOrderRow>();

  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (isSuccessfulPaymentStatus(existingOrder.payment_status)) return NextResponse.json({ ok: true, idempotent: true });

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

  if (!signatureResult.valid) {
    await admin.data
      .from("featured_listing_orders")
      .update({ payment_status: "failed", order_status: "cancelled", failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", existingOrder.id);

    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const paidAt = new Date().toISOString();
  const { error: orderUpdateError } = await admin.data
    .from("featured_listing_orders")
    .update({
      payment_status: "paid",
      order_status: "confirmed",
      paid_at: paidAt,
      updated_at: paidAt,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    })
    .eq("id", existingOrder.id)
    .in("payment_status", ["pending", "failed"]);

  if (orderUpdateError) return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });

  const { data: plan } = await admin.data
    .from("featured_listing_plans")
    .select("id,plan_code,code")
    .eq("id", existingOrder.plan_id)
    .maybeSingle<FeaturedPlanRow>();
  const planCode = plan?.plan_code ?? plan?.code;
  if (!planCode) return NextResponse.json({ error: "Unable to resolve featured plan details" }, { status: 500 });

  const currentActive = await getCurrentActiveSubscription(admin.data, institute.id);
  const isUpgrade = Boolean(existingOrder.is_upgrade);
  const baseAmount = toNumber(existingOrder.base_amount ?? existingOrder.amount);
  const creditAdjustmentAmount = toNumber(existingOrder.credit_adjustment_amount);
  const finalPayableAmount = toNumber(existingOrder.final_payable_amount ?? existingOrder.amount);
  const nextWindow = await getNextSubscriptionWindow(admin.data, institute.id);
  const shouldQueue = !isUpgrade && nextWindow.shouldQueue;

  let startsAt = paidAt;
  let status: "active" | "scheduled" = "active";

  if (shouldQueue) {
    startsAt = nextWindow.startAtIso;
    status = "scheduled";
  }

  const endsAt = addDurationDays(startsAt, Number(existingOrder.duration_days));

  let replacedSubscriptionId: string | null = null;

  if (isUpgrade && currentActive) {
    const { error: expireError } = await admin.data
      .from("institute_featured_subscriptions")
      .update({
        status: "expired",
        ends_at: paidAt,
        updated_at: paidAt,
      })
      .eq("id", currentActive.id);

    if (expireError) return NextResponse.json({ error: expireError.message }, { status: 500 });
    replacedSubscriptionId = currentActive.id;
  }

  const insertPayload: Record<string, unknown> = {
    institute_id: institute.id,
    created_by: auth.user.id,
    plan_code: planCode,
    amount: baseAmount,
    currency: existingOrder.currency,
    duration_days: existingOrder.duration_days,
    starts_at: startsAt,
    ends_at: endsAt,
    status,
    queued_from_previous: shouldQueue,
    plan_id: existingOrder.plan_id,
    order_id: existingOrder.id,
    activated_at: status === "active" ? paidAt : null,
    auto_renew: Boolean(existingOrder.auto_renew_requested),
    end_behavior: existingOrder.auto_renew_requested ? "auto_renew" : "stop",
    auto_renew_plan_id: existingOrder.auto_renew_requested ? existingOrder.plan_id : null,
    upgrade_credit_used: creditAdjustmentAmount,
    upgraded_from_subscription_id: replacedSubscriptionId,
    auto_renewed_from_subscription_id: null,
  };

  const { data: insertedSubscription, error: insertSubscriptionError } = await admin.data
    .from("institute_featured_subscriptions")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (insertSubscriptionError) return NextResponse.json({ error: insertSubscriptionError.message }, { status: 500 });

  if (isUpgrade && replacedSubscriptionId) {
    await admin.data
      .from("institute_featured_subscriptions")
      .update({ upgraded_to_subscription_id: insertedSubscription.id, updated_at: paidAt })
      .eq("id", replacedSubscriptionId);

    await admin.data
      .from("featured_listing_orders")
      .update({ upgraded_from_order_id: currentActive?.order_id ?? null, updated_at: paidAt })
      .eq("id", existingOrder.id);
  }

  await createAccountNotification({
    userId: auth.user.id,
    type: "approval",
    title: isUpgrade ? "Featured listing upgraded" : "Featured listing activated",
    message:
      status === "active"
        ? isUpgrade
          ? "Upgrade successful. Your new featured plan is active immediately."
          : "Your featured listing is now active and visible on discovery pages."
        : "Your featured listing purchase is confirmed and queued to start automatically.",
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    idempotent: false,
    startsAt,
    endsAt,
    status,
    isUpgrade,
    baseAmount,
    creditAdjustmentAmount,
    finalPayableAmount,
  });
}
