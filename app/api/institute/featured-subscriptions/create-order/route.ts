import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanRow = Record<string, unknown>;
type SubscriptionRow = Record<string, unknown>;
type RpcResultRow = Record<string, unknown>;
type SubscriptionWindow = {
  startAtIso: string;
  shouldQueue: boolean;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function resolveRpcRow(data: unknown): RpcResultRow | null {
  if (Array.isArray(data)) return (data[0] as RpcResultRow | undefined) ?? null;
  if (!data || typeof data !== "object") return null;
  return data as RpcResultRow;
}

async function getCurrentActiveSubscription(admin: SupabaseClient, instituteId: string) {
  const argVariants: Array<Record<string, unknown>> = [{ p_institute_id: instituteId }, { institute_id: instituteId }];

  for (const args of argVariants) {
    const { data, error } = await admin.rpc("get_current_active_featured_subscription", args);
    if (error) continue;
    const row = resolveRpcRow(data);
    if (row) return row;
  }

  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("institute_featured_subscriptions")
    .select("*")
    .eq("institute_id", instituteId)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as SubscriptionRow | null;
}

async function getNextSubscriptionWindow(admin: SupabaseClient, instituteId: string): Promise<SubscriptionWindow> {
  const nowIso = new Date().toISOString();
  const argVariants: Array<Record<string, unknown>> = [{ p_institute_id: instituteId }, { institute_id: instituteId }];

  for (const args of argVariants) {
    const { data, error } = await admin.rpc("get_next_featured_subscription_window", args);
    if (error) continue;

    const row = resolveRpcRow(data);
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
  return {
    startAtIso: shouldQueue ? tail.ends_at : nowIso,
    shouldQueue,
  };
}

async function calculateUpgradeCredit(
  admin: SupabaseClient,
  activeSubscriptionId: string,
  selectedPlanId: string,
  atIso: string
) {
  const argVariants: Array<Record<string, unknown>> = [
    { p_active_subscription_id: activeSubscriptionId, p_selected_plan_id: selectedPlanId, p_calculated_at: atIso },
    { active_subscription_id: activeSubscriptionId, selected_plan_id: selectedPlanId, calculated_at: atIso },
    { p_active_subscription_id: activeSubscriptionId, p_target_plan_id: selectedPlanId, p_calculated_at: atIso },
    { active_subscription_id: activeSubscriptionId, target_plan_id: selectedPlanId, calculated_at: atIso },
  ];

  for (const args of argVariants) {
    const { data, error } = await admin.rpc("calculate_featured_upgrade_credit", args);
    if (error) continue;
    const row = resolveRpcRow(data);
    if (!row) continue;

    const credit = toNumber(row.credit_adjustment_amount ?? row.remaining_credit ?? row.credit_amount ?? row.credit);
    const base = toNumber(row.base_amount ?? row.target_plan_amount);
    const final = toNumber(row.final_payable_amount);
    return {
      credit: Math.max(0, credit),
      base: base > 0 ? base : null,
      final: final > 0 ? final : null,
    };
  }

  return { credit: 0, base: null, final: null };
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { planId, autoRenewRequested, previewOnly } = (await request.json()) as { planId?: string; autoRenewRequested?: boolean; previewOnly?: boolean };
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

  const baseAmount = toNumber(plan.price ?? plan.amount);
  const durationDays = toNumber(plan.duration_days);
  const currency = typeof plan.currency === "string" && plan.currency ? plan.currency : "INR";
  const selectedTierRank = toNumber(plan.tier_rank);

  if (baseAmount <= 0 || durationDays <= 0) {
    return NextResponse.json({ error: "Invalid featured plan configuration" }, { status: 400 });
  }

  const active = await getCurrentActiveSubscription(admin.data, institute.id);
  const window = await getNextSubscriptionWindow(admin.data, institute.id);
  let currentTierRank = -1;
  let currentSubscriptionId: string | null = null;
  let queuedOrder = false;
  let isUpgrade = false;
  let creditAdjustmentAmount = 0;

  if (active) {
    currentSubscriptionId = String(active.id ?? "");

    const activePlanId = typeof active.plan_id === "string" ? active.plan_id : null;
    if (activePlanId) {
      const { data: activePlan } = await admin.data
        .from("featured_listing_plans")
        .select("tier_rank")
        .eq("id", activePlanId)
        .maybeSingle<Record<string, unknown>>();
      currentTierRank = toNumber(activePlan?.tier_rank);
    }

    if (selectedTierRank > currentTierRank && currentSubscriptionId) {
      isUpgrade = true;
      const credit = await calculateUpgradeCredit(admin.data, currentSubscriptionId, planId, new Date().toISOString());
      creditAdjustmentAmount = Math.max(0, Math.min(baseAmount, credit.credit));
    } else {
      queuedOrder = true;
    }
  }

  if (!isUpgrade && window.shouldQueue) queuedOrder = true;

  const finalPayableAmount = Math.max(0, baseAmount - creditAdjustmentAmount);


  if (previewOnly) {
    return NextResponse.json({
      preview: true,
      plan: { id: planId, baseAmount, creditAdjustmentAmount, finalPayableAmount, currency, durationDays },
      purchaseMode: {
        isUpgrade,
        queuedOrder,
        currentTierRank,
        selectedTierRank,
      },
    });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  const receipt = `featured_${String(planId).slice(0, 8)}_${Date.now()}`;
  const order = await razorpay.data.orders.create({
    amount: Math.round(finalPayableAmount * 100),
    currency,
    receipt,
    notes: {
      instituteId: institute.id,
      userId: auth.user.id,
      planId,
      productType: "featured_listing_subscription",
      isUpgrade: isUpgrade ? "true" : "false",
      queuedOrder: queuedOrder ? "true" : "false",
      autoRenewRequested: autoRenewRequested ? "true" : "false",
    },
  });

  const { data: insertedOrder, error: insertError } = await admin.data
    .from("featured_listing_orders")
    .insert({
      institute_id: institute.id,
      created_by: auth.user.id,
      plan_id: planId,
      amount: finalPayableAmount,
      base_amount: baseAmount,
      credit_adjustment_amount: creditAdjustmentAmount,
      final_payable_amount: finalPayableAmount,
      is_upgrade: isUpgrade,
      upgraded_from_subscription_id: currentSubscriptionId,
      currency,
      duration_days: durationDays,
      payment_status: "pending",
      order_status: queuedOrder ? "scheduled" : "pending",
      auto_renew_requested: Boolean(autoRenewRequested),
      razorpay_order_id: order.id,
      razorpay_receipt: order.receipt ?? receipt,
      metadata: {
        source: "featured_create_order_api",
        queued_order: queuedOrder,
        selected_tier_rank: selectedTierRank,
        current_tier_rank: currentTierRank,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    order,
    orderRecordId: insertedOrder.id,
    plan: { id: planId, baseAmount, creditAdjustmentAmount, finalPayableAmount, currency, durationDays },
    purchaseMode: {
      isUpgrade,
      queuedOrder,
      currentTierRank,
      selectedTierRank,
    },
  });
}
