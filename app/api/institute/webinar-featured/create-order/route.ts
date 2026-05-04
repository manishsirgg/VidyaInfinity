import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { resolveFeaturedPlan } from "@/lib/featured-plan-resolution";
import { notifyInstituteAndAdmins } from "@/lib/featured-notifications";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getCurrentFeaturedState, resolveFeaturedPurchasePolicy } from "@/lib/featured-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isWebinarPromotable } from "@/lib/webinar-featured";

type RequestBody = {
  webinarId?: string;
  planId?: string;
};

type PlanRow = {
  id: string | number;
  plan_code: string | null;
  duration_days: number;
  price: number | null;
  currency: string | null;
  is_active: boolean | null;
  tier_rank: number | null;
};

type WebinarRow = {
  id: string;
  institute_id: string;
  approval_status: string;
  status: string;
  ends_at: string | null;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}


export async function POST(request: Request) {
  let stage = "auth";
  let orderId: string | null = null;
  let instituteId: string | null = null;

  try {
    const auth = await requireApiUser("institute");
    if ("error" in auth) {
      console.error("[webinar-featured/create-order] failed", { stage, reason: "auth_failed" });
      return auth.error;
    }

    console.info("[webinar-featured/create-order] stage", { stage: "auth_ok", userId: auth.user.id });

    const body = (await request.json()) as RequestBody;
    if (!body.planId || !body.webinarId) {
      console.error("[webinar-featured/create-order] failed", {
        stage: "payload_validation",
        userId: auth.user.id,
        hasWebinarId: Boolean(body.webinarId),
        hasPlanId: Boolean(body.planId),
      });
      return NextResponse.json({ error: "webinarId and planId are required" }, { status: 400 });
    }

    stage = "supabase_admin";
    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      console.error("[webinar-featured/create-order] failed", { stage, userId: auth.user.id, error: admin.error });
      return NextResponse.json({ error: admin.error }, { status: 500 });
    }

    stage = "institute_lookup";
    instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
    if (!instituteId) {
      console.error("[webinar-featured/create-order] failed", { stage, userId: auth.user.id, error: "institute_not_found" });
      return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });
    }
    console.info("[webinar-featured/create-order] stage", { stage: "institute_ok", userId: auth.user.id, instituteId });

    stage = "webinar_lookup";
    const { data: webinar } = await admin.data
      .from("webinars")
      .select("id,institute_id,approval_status,status,ends_at")
      .eq("id", body.webinarId)
      .eq("institute_id", instituteId)
      .maybeSingle<WebinarRow>();

    if (!webinar) {
      console.error("[webinar-featured/create-order] failed", { stage, instituteId, userId: auth.user.id, webinarId: body.webinarId, error: "webinar_not_found" });
      return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
    }
    if (!isWebinarPromotable(webinar)) {
      console.error("[webinar-featured/create-order] failed", {
        stage,
        instituteId,
        userId: auth.user.id,
        webinarId: body.webinarId,
        webinarStatus: webinar.status,
        webinarApprovalStatus: webinar.approval_status,
        webinarEndsAt: webinar.ends_at,
        error: "webinar_not_eligible",
      });
      return NextResponse.json({ error: "Only approved scheduled/live webinars with valid end dates can be promoted" }, { status: 400 });
    }
    console.info("[webinar-featured/create-order] stage", { stage: "content_ok", userId: auth.user.id, instituteId, webinarId: body.webinarId });

    stage = "plan_resolution";
    const planResolution = await resolveFeaturedPlan({
      admin: admin.data,
      table: "webinar_featured_plans",
      selectedPlanToken: body.planId,
    });
    const plan = planResolution.plan as PlanRow | null;

    if (!plan || plan.is_active === false) {
      console.error("[webinar-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        webinarId: body.webinarId,
        selectedPlanToken: body.planId,
        resolution: planResolution.resolution,
        error: "plan_not_found",
      });
      return NextResponse.json(
        {
          error: `Featured plan not found for token "${body.planId.trim()}" in /api/institute/webinar-featured/create-order`,
          details: { availablePlanTokens: planResolution.availablePlanTokens },
        },
        { status: 404 },
      );
    }

    const { data: canonicalPlan } = await admin.data
      .from("webinar_featured_plans")
      .select("id,plan_code,duration_days,price,currency,is_active,tier_rank")
      .eq("id", String(plan.id))
      .or("is_active.eq.true,is_active.is.null")
      .maybeSingle<PlanRow>();
    const resolvedPlan = canonicalPlan ?? plan;

    const durationDays = toNumber(resolvedPlan.duration_days);
    const amount = toNumber(resolvedPlan.price);
    const currency = typeof resolvedPlan.currency === "string" && resolvedPlan.currency.length > 0 ? resolvedPlan.currency : "INR";

    if (durationDays <= 0 || amount <= 0) {
      console.error("[webinar-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        webinarId: body.webinarId,
        planId: String(resolvedPlan.id),
        durationDays,
        amount,
        error: "invalid_plan_configuration",
      });
      return NextResponse.json({ error: "Invalid plan configuration" }, { status: 400 });
    }

    console.info("[webinar-featured/create-order] stage", {
      stage: "plan_ok",
      userId: auth.user.id,
      instituteId,
      webinarId: body.webinarId,
      selectedPlanToken: body.planId,
      resolvedPlanId: String(resolvedPlan.id),
      resolution: planResolution.resolution,
      amount,
      currency,
      durationDays,
    });
    const state = await getCurrentFeaturedState({ supabase: admin.data, type: "webinar", instituteId, targetId: body.webinarId });
    const selectedPlan = { id: String(resolvedPlan.id), plan_code: resolvedPlan.plan_code, duration_days: durationDays, price: resolvedPlan.price, tier_rank: resolvedPlan.tier_rank };
    const activePlan = state.currentPlanId ? state.planById.get(String(state.currentPlanId)) ?? null : null;
    const policy = resolveFeaturedPurchasePolicy(activePlan, selectedPlan);
    if (policy.purchase_intent === "blocked") return NextResponse.json({ error: "A higher or equal featured plan is already active." }, { status: 409 });

    stage = "local_order_insert";
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await admin.data
      .from("webinar_featured_orders")
      .insert({
        institute_id: instituteId,
        created_by: auth.user.id,
        webinar_id: body.webinarId,
        plan_id: String(resolvedPlan.id),
        amount,
        currency,
        duration_days: durationDays,
        payment_status: "pending",
        order_status: "pending",
        paid_at: null,
        razorpay_order_id: null,
        razorpay_payment_id: null,
        razorpay_signature: null,
        metadata: {
          source: "webinar_featured_create_order_api",
          tier_rank: resolvedPlan.tier_rank ?? null,
          plan_resolution: planResolution.resolution,
          razorpay_stage: "not_created",
          payment_method: "razorpay",
          is_upgrade: policy.purchase_intent === "upgrade",
          purchase_intent: policy.purchase_intent,
          activation_mode: policy.activation_mode,
          previous_subscription_id: state.activeSubscription?.id ?? null,
          previous_plan_code: state.currentPlanCode ?? null,
          previous_ends_at: state.activeSubscription?.ends_at ?? null,
          selected_plan_code: resolvedPlan.plan_code ?? null,
        },
        updated_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !inserted?.id) {
      console.error("[webinar-featured/create-order] failed", { stage, userId: auth.user.id, instituteId, webinarId: body.webinarId, planId: String(resolvedPlan.id), error: insertError?.message ?? "unknown_insert_error" });
      return NextResponse.json({ error: insertError?.message ?? "Unable to persist local order" }, { status: 500 });
    }

    orderId = inserted.id;
    console.info("[webinar-featured/create-order] stage", { stage: "local_order_inserted", userId: auth.user.id, instituteId, webinarId: body.webinarId, localOrderId: orderId, planId: String(resolvedPlan.id) });

    stage = "razorpay_client_init";
    const razorpay = getRazorpayClient();
    if (!razorpay.ok) {
      await admin.data
        .from("webinar_featured_orders")
        .update({
          order_status: "cancelled",
          metadata: {
            source: "webinar_featured_create_order_api",
            tier_rank: resolvedPlan.tier_rank ?? null,
            plan_resolution: planResolution.resolution,
            razorpay_stage: "client_init_failed",
            razorpay_error: razorpay.error,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .in("order_status", ["pending", "failed"]);

      console.error("[webinar-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        error: razorpay.error,
      });

      return NextResponse.json({ error: razorpay.error, orderId }, { status: 500 });
    }
    console.info("[webinar-featured/create-order] stage", { stage: "razorpay_client_ok", userId: auth.user.id, instituteId, localOrderId: orderId });

    stage = "razorpay_order_create";
    const receipt = `wf_${orderId.replace(/-/g, "").slice(0, 12)}_${Date.now().toString().slice(-8)}`;

    let order: { id: string; receipt: string | null; amount: number; currency: string };
    try {
      const created = await razorpay.data.orders.create({
        amount: Math.round(amount * 100),
        currency,
        receipt,
        notes: {
          userId: auth.user.id,
          instituteId,
          webinarId: body.webinarId,
          localOrderId: orderId,
          planId: String(resolvedPlan.id),
          productType: "webinar_featured_listing",
          payoutEligible: "false",
        },
      });
      order = { id: created.id, receipt: created.receipt ?? null, amount: toNumber(created.amount), currency: String(created.currency ?? currency) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create Razorpay order";
      await admin.data
        .from("webinar_featured_orders")
        .update({
          order_status: "cancelled",
          metadata: {
            source: "webinar_featured_create_order_api",
            tier_rank: resolvedPlan.tier_rank ?? null,
            plan_resolution: planResolution.resolution,
            razorpay_stage: "order_create_failed",
            razorpay_error: message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .in("order_status", ["pending", "failed"]);

      console.error("[webinar-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        webinarId: body.webinarId,
        planId: String(resolvedPlan.id),
        error: message,
      });

      return NextResponse.json({ error: message, orderId }, { status: 502 });
    }

    console.info("[webinar-featured/create-order] stage", {
      stage: "razorpay_order_created",
      userId: auth.user.id,
      instituteId,
      localOrderId: orderId,
      razorpayOrderId: order.id,
      receipt: order.receipt,
    });

    stage = "local_order_update";
    const { error: updateError } = await admin.data
      .from("webinar_featured_orders")
      .update({
        razorpay_order_id: order.id,
        razorpay_receipt: order.receipt ?? receipt,
        metadata: {
          source: "webinar_featured_create_order_api",
          tier_rank: resolvedPlan.tier_rank ?? null,
          plan_resolution: planResolution.resolution,
          razorpay_stage: "order_created",
          razorpay_receipt: order.receipt ?? receipt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .in("order_status", ["pending", "failed"]);

    if (updateError) {
      console.error("[webinar-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        razorpayOrderId: order.id,
        error: updateError.message,
      });
      return NextResponse.json({ error: updateError.message, orderId }, { status: 500 });
    }

    console.info("[webinar-featured/create-order] stage", {
      stage: "local_order_updated",
      userId: auth.user.id,
      instituteId,
      localOrderId: orderId,
      razorpayOrderId: order.id,
    });

    await notifyInstituteAndAdmins({
      admin: admin.data,
      instituteUserId: auth.user.id,
      title: "Webinar promotion payment initiated",
      message: "A Razorpay order was created for a webinar featured promotion purchase.",
      metadata: { webinarId: body.webinarId, orderId, planId: String(resolvedPlan.id), razorpayOrderId: order.id },
    });

    console.info("[webinar-featured/create-order] stage", {
      stage: "success_response",
      userId: auth.user.id,
      instituteId,
      localOrderId: orderId,
      razorpayOrderId: order.id,
    });

    return NextResponse.json({
      ok: true,
      payment_required: true,
      order,
      purchase: {
        id: orderId,
        webinarId: body.webinarId,
        planId: String(resolvedPlan.id),
        durationDays,
        amount,
        currency,
        planCode: resolvedPlan.plan_code ?? "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while creating webinar featured order";
    console.error("[webinar-featured/create-order] failed", { stage, instituteId, localOrderId: orderId, error: message });
    return NextResponse.json({ error: message, orderId }, { status: 500 });
  }
}
