import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { compareFeaturedPlans, getCurrentFeaturedState } from "@/lib/featured-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanRow = Record<string, unknown>;
type SubscriptionRow = Record<string, unknown>;
type RpcResultRow = Record<string, unknown>;
type SubscriptionWindow = {
  startAtIso: string;
  shouldQueue: boolean;
};

function parseUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function addDurationDays(baseIso: string, durationDays: number) {
  const start = new Date(baseIso);
  const endMs = start.getTime() + Math.max(0, durationDays) * 24 * 60 * 60 * 1000;
  return new Date(endMs).toISOString();
}

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

  const baseAmount = toNumber(plan.price);
  const durationDays = toNumber(plan.duration_days);
  const currency = typeof plan.currency === "string" && plan.currency ? plan.currency : "INR";
  const selectedTierRank = toNumber(plan.tier_rank);

  if (baseAmount <= 0 || durationDays <= 0) {
    return NextResponse.json({ error: "Invalid featured plan configuration" }, { status: 400 });
  }

  const featuredState = await getCurrentFeaturedState({ supabase: admin.data, type: "institute", instituteId: institute.id });
  const selectedPlan = { id: planId, plan_code: typeof plan.plan_code === "string" ? plan.plan_code : null, duration_days: durationDays, amount: baseAmount, price: toNumber(plan.price), tier_rank: selectedTierRank };
  const currentPlan = featuredState.currentPlanId ? featuredState.planById.get(String(featuredState.currentPlanId)) ?? null : null;
  let decision: "fresh_purchase" | "upgrade" | "blocked_same" | "blocked_lower_equal" = "fresh_purchase";
  if (featuredState.activeSubscription && currentPlan) {
    const cmp = compareFeaturedPlans(currentPlan, selectedPlan);
    if (cmp === 0 || String(currentPlan.id) === String(selectedPlan.id)) {
      decision = "blocked_same";
      console.info("[featured.create-order]", { selectedPlanId: planId, foundPlanId: plan.id, planPrice: baseAmount, planCode: selectedPlan.plan_code, durationDays, currentActivePlanId: currentPlan.id, currentActivePlanCode: currentPlan.plan_code, decision });
      return NextResponse.json({ error: "This plan is already active." }, { status: 409 });
    }
    if (cmp < 0) {
      decision = "blocked_lower_equal";
      console.info("[featured.create-order]", { selectedPlanId: planId, foundPlanId: plan.id, planPrice: baseAmount, planCode: selectedPlan.plan_code, durationDays, currentActivePlanId: currentPlan.id, currentActivePlanCode: currentPlan.plan_code, decision });
      return NextResponse.json({ error: "You already have an active higher or equal featured plan." }, { status: 409 });
    }
  }

  const active = await getCurrentActiveSubscription(admin.data, institute.id);
  const window = await getNextSubscriptionWindow(admin.data, institute.id);
  let currentTierRank = -1;
  let currentSubscriptionId: string | null = null;
  let queuedOrder = false;
  let isUpgrade = false;
  let creditAdjustmentAmount = 0;

  if (active) {
    currentSubscriptionId = parseUuid(active.id);

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
      decision = "upgrade";
      const credit = await calculateUpgradeCredit(admin.data, currentSubscriptionId, planId, new Date().toISOString());
      creditAdjustmentAmount = Math.max(0, Math.min(baseAmount, credit.credit));
    } else {
      queuedOrder = true;
    }
  }

  if (!isUpgrade && window.shouldQueue) queuedOrder = true;

  const payableAfterUpgradeCredit = Math.max(0, baseAmount - creditAdjustmentAmount);
  console.info("[featured.create-order]", { selectedPlanId: planId, foundPlanId: plan.id, planPrice: baseAmount, planCode: selectedPlan.plan_code, durationDays, currentActivePlanId: currentPlan?.id ?? null, currentActivePlanCode: currentPlan?.plan_code ?? null, decision });

  const walletAvailable = 0;
  const walletAdjustmentAmount = 0;
  const finalPayableAmount = payableAfterUpgradeCredit;
  const totalCreditAdjustmentAmount = creditAdjustmentAmount;


  if (previewOnly) {
    return NextResponse.json({
      preview: true,
      plan: { id: planId, baseAmount, creditAdjustmentAmount: totalCreditAdjustmentAmount, finalPayableAmount, currency, durationDays },
      wallet: { availableBalance: walletAvailable, usedAmount: walletAdjustmentAmount },
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
      credit_adjustment_amount: totalCreditAdjustmentAmount,
      final_payable_amount: finalPayableAmount,
      is_upgrade: isUpgrade,
      upgraded_from_subscription_id: currentSubscriptionId,
      currency,
      duration_days: durationDays,
      payment_status: finalPayableAmount > 0 ? "pending" : "paid",
      order_status: "pending",
      auto_renew_requested: Boolean(autoRenewRequested),
      razorpay_order_id: order?.id ?? null,
      razorpay_receipt: order?.receipt ?? null,
      paid_at: finalPayableAmount > 0 ? null : new Date().toISOString(),
      metadata: {
        source: "featured_create_order_api",
        queued_order: queuedOrder,
        selected_tier_rank: selectedTierRank,
        current_tier_rank: currentTierRank,
        payment_method: "razorpay",
        upgrade_credit_amount: creditAdjustmentAmount,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  let instantActivationStatus: "active" | "scheduled" | null = null;
  if (finalPayableAmount <= 0) {
    const paidAt = new Date().toISOString();
    const { data: currentActive } = await admin.data
      .from("institute_featured_subscriptions")
      .select("id,order_id")
      .eq("institute_id", institute.id)
      .lte("starts_at", paidAt)
      .gt("ends_at", paidAt)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; order_id: string | null }>();

    const { data: planDetails } = await admin.data
      .from("featured_listing_plans")
      .select("plan_code")
      .eq("id", planId)
      .maybeSingle<{ plan_code: string | null }>();
    const planCode = planDetails?.plan_code;
    if (!planCode) return NextResponse.json({ error: "Unable to resolve featured plan details" }, { status: 500 });

    const shouldQueue = !isUpgrade && window.shouldQueue;
    const startsAt = shouldQueue ? window.startAtIso : paidAt;
    const status = shouldQueue ? "scheduled" : "active";
    const endsAt = addDurationDays(startsAt, durationDays);
    let replacedSubscriptionId: string | null = null;

    if (isUpgrade && currentActive?.id) {
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

    const { data: insertedSubscription, error: subInsertError } = await admin.data
      .from("institute_featured_subscriptions")
      .insert({
        institute_id: institute.id,
        created_by: auth.user.id,
        plan_code: planCode,
        amount: baseAmount,
        currency,
        duration_days: durationDays,
        starts_at: startsAt,
        ends_at: endsAt,
        status,
        queued_from_previous: shouldQueue,
        plan_id: planId,
        order_id: insertedOrder.id,
        activated_at: status === "active" ? paidAt : null,
        auto_renew: Boolean(autoRenewRequested),
        end_behavior: autoRenewRequested ? "auto_renew" : "stop",
        auto_renew_plan_id: autoRenewRequested ? planId : null,
        upgrade_credit_used: totalCreditAdjustmentAmount,
        upgraded_from_subscription_id: replacedSubscriptionId,
      })
      .select("id")
      .single<{ id: string }>();
    if (subInsertError) return NextResponse.json({ error: subInsertError.message }, { status: 500 });

    if (isUpgrade && replacedSubscriptionId) {
      await admin.data
        .from("institute_featured_subscriptions")
        .update({ upgraded_to_subscription_id: insertedSubscription.id, updated_at: paidAt })
        .eq("id", replacedSubscriptionId);

      await admin.data
        .from("featured_listing_orders")
        .update({ upgraded_from_order_id: currentActive?.order_id ?? null, updated_at: paidAt })
        .eq("id", insertedOrder.id);
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
          : "Your featured listing is confirmed and queued to start automatically.",
    }).catch(() => undefined);

    instantActivationStatus = status;
  }



  return NextResponse.json({
    order,
    orderRecordId: insertedOrder.id,
    plan: { id: planId, baseAmount, creditAdjustmentAmount: totalCreditAdjustmentAmount, finalPayableAmount, currency, durationDays },
    wallet: { availableBalance: 0, usedAmount: 0 },
    payment: { requiresRazorpay: true, paidFromWalletOnly: false },
    payment_required: true,
    subscription: { activated: finalPayableAmount <= 0, status: instantActivationStatus },
    purchaseMode: {
      isUpgrade,
      queuedOrder,
      currentTierRank,
      selectedTierRank,
    },
  });
}
