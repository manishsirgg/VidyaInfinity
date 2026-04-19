import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type NextWindowResult = {
  startsAt: string;
  endsAt: string;
  queuedFromPrevious: boolean;
};

type FeaturedOrderRow = {
  id: string;
  institute_id: string;
  created_by: string;
  plan_id: string;
  amount: number;
  currency: string;
  duration_days: number;
  payment_status: string;
  razorpay_order_id: string;
};
type FeaturedPlanRow = {
  id: string;
  plan_code: string | null;
  code: string | null;
};

function readDate(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function getNextWindow(
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>,
  instituteId: string,
  durationDays: number
): Promise<NextWindowResult> {
  const argumentOptions: Array<Record<string, unknown>> = [
    { p_institute_id: instituteId, p_duration_days: durationDays },
    { institute_id: instituteId, duration_days: durationDays },
    { target_institute_id: instituteId, target_duration_days: durationDays },
  ];

  let lastError = "Failed to compute featured subscription window";

  for (const args of argumentOptions) {
    const response = await rpc("get_next_featured_subscription_window", args);
    if (response.error) {
      lastError = response.error.message ?? lastError;
      continue;
    }

    const row = Array.isArray(response.data)
      ? (response.data[0] as Record<string, unknown> | undefined)
      : (response.data as Record<string, unknown> | null);

    if (!row) continue;

    const startsAt = readDate(row, "starts_at") ?? readDate(row, "start_at");
    const endsAt = readDate(row, "ends_at") ?? readDate(row, "end_at");

    if (!startsAt || !endsAt) continue;

    const queuedFlag = row.queued_from_previous;
    return {
      startsAt,
      endsAt,
      queuedFromPrevious:
        typeof queuedFlag === "boolean"
          ? queuedFlag
          : new Date(startsAt).getTime() > Date.now(),
    };
  }

  throw new Error(lastError);
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
    .select("id,institute_id,created_by,plan_id,amount,currency,duration_days,payment_status,razorpay_order_id")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", institute.id)
    .maybeSingle<FeaturedOrderRow>();

  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (existingOrder.payment_status === "paid") return NextResponse.json({ ok: true, idempotent: true });

  const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });

  if (!signatureResult.valid) {
    await admin.data
      .from("featured_listing_orders")
      .update({ payment_status: "failed", order_status: "failed", updated_at: new Date().toISOString() })
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

  const window = await getNextWindow(
    async (fn, params) => {
      const { data, error } = await admin.data.rpc(fn, params);
      return { data, error };
    },
    institute.id,
    Number(existingOrder.duration_days)
  );
  const { data: plan } = await admin.data
    .from("featured_listing_plans")
    .select("id,plan_code,code")
    .eq("id", existingOrder.plan_id)
    .maybeSingle<FeaturedPlanRow>();
  const planCode = plan?.plan_code ?? plan?.code;
  if (!planCode) return NextResponse.json({ error: "Unable to resolve featured plan details" }, { status: 500 });

  const startsAtMs = new Date(window.startsAt).getTime();
  const endsAtMs = new Date(window.endsAt).getTime();
  const nowMs = Date.now();

  const status = startsAtMs <= nowMs && endsAtMs > nowMs ? "active" : startsAtMs > nowMs ? "scheduled" : "expired";

  const { error: insertSubscriptionError } = await admin.data.from("institute_featured_subscriptions").insert({
    institute_id: institute.id,
    created_by: auth.user.id,
    plan_code: planCode,
    amount: existingOrder.amount,
    currency: existingOrder.currency,
    duration_days: existingOrder.duration_days,
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    status,
    queued_from_previous: window.queuedFromPrevious,
    plan_id: existingOrder.plan_id,
    order_id: existingOrder.id,
    activated_at: status === "active" ? paidAt : null,
  });

  if (insertSubscriptionError) return NextResponse.json({ error: insertSubscriptionError.message }, { status: 500 });

  await createAccountNotification({
    userId: auth.user.id,
    type: "approval",
    title: "Featured listing activated",
    message:
      status === "active"
        ? "Your featured listing is now active and visible on discovery pages."
        : "Your featured listing purchase is confirmed and queued to start automatically.",
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, idempotent: false, startsAt: window.startsAt, endsAt: window.endsAt, status });
}
