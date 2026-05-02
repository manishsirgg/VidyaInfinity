import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { resolveFeaturedPlan } from "@/lib/featured-plan-resolution";
import { notifyInstituteAndAdmins } from "@/lib/featured-notifications";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RequestBody = {
  courseId?: string;
  planId?: string;
};

type PlanRow = {
  id: string | number;
  plan_code: string | null;
  code: string | null;
  duration_days: number;
  amount: number | null;
  price: number | null;
  currency: string | null;
  is_active: boolean | null;
  tier_rank: number | null;
};

type CourseRow = {
  id: string;
  institute_id: string;
  status: string;
  is_active: boolean | null;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}


function resolvePayableAmountRupees(plan: PlanRow) {
  const amountRaw = toNumber(plan.amount);
  const priceRaw = toNumber(plan.price);
  const amount = amountRaw > 0 ? amountRaw : 0;
  const price = priceRaw > 0 ? priceRaw : 0;

  if (price > 0 && amount > 0) {
    const ratio = amount / price;
    if (Math.abs(ratio - 100) < 0.001) {
      return {
        payableAmount: price,
        source: "price_rupees_with_amount_paise" as const,
        planAmountRaw: amount,
        planPriceRaw: price,
      };
    }
    if (Math.abs(ratio - 1) < 0.001) {
      return {
        payableAmount: amount,
        source: "amount_or_price_rupees" as const,
        planAmountRaw: amount,
        planPriceRaw: price,
      };
    }
  }

  if (price > 0) {
    return {
      payableAmount: price,
      source: "price_rupees" as const,
      planAmountRaw: amount,
      planPriceRaw: price,
    };
  }

  return {
    payableAmount: amount,
    source: "amount_rupees" as const,
    planAmountRaw: amount,
    planPriceRaw: price,
  };
}

export async function POST(request: Request) {
  let stage = "auth";
  let orderId: string | null = null;
  let instituteId: string | null = null;

  try {
    const auth = await requireApiUser("institute");
    if ("error" in auth) {
      console.error("[course-featured/create-order] failed", { stage, reason: "auth_failed" });
      return auth.error;
    }

    console.info("[course-featured/create-order] stage", { stage: "auth_ok", userId: auth.user.id });

    const body = (await request.json()) as RequestBody;
    if (!body.planId || !body.courseId) {
      console.error("[course-featured/create-order] failed", {
        stage: "payload_validation",
        userId: auth.user.id,
        hasCourseId: Boolean(body.courseId),
        hasPlanId: Boolean(body.planId),
      });
      return NextResponse.json({ error: "courseId and planId are required" }, { status: 400 });
    }

    stage = "supabase_admin";
    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      console.error("[course-featured/create-order] failed", { stage, userId: auth.user.id, error: admin.error });
      return NextResponse.json({ error: admin.error }, { status: 500 });
    }

    stage = "institute_lookup";
    const userInstituteId = await getInstituteIdForUser(admin.data, auth.user.id);
    if (!userInstituteId) {
      console.error("[course-featured/create-order] failed", { stage, userId: auth.user.id, error: "institute_not_found" });
      return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });
    }
    console.info("[course-featured/create-order] stage", { stage: "institute_ok", userId: auth.user.id, instituteId: userInstituteId });

    stage = "course_lookup";
    const { data: course } = await admin.data
      .from("courses")
      .select("id,institute_id,status,is_active")
      .eq("id", body.courseId)
      .maybeSingle<CourseRow>();

    if (!course) {
      console.error("[course-featured/create-order] failed", {
        stage,
        instituteId: userInstituteId,
        userId: auth.user.id,
        courseId: body.courseId,
        error: "course_not_found",
      });
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    instituteId = course.institute_id;
    const { data: courseInstitute } = await admin.data
      .from("institutes")
      .select("id,user_id")
      .eq("id", instituteId)
      .maybeSingle<{ id: string; user_id: string | null }>();

    if (!courseInstitute || courseInstitute.user_id !== auth.user.id) {
      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        userInstituteId,
        resolvedInstituteId: instituteId,
        courseId: body.courseId,
        error: "course_institute_mismatch",
      });
      return NextResponse.json({ error: "You are not allowed to feature this course" }, { status: 403 });
    }

    if (course.status !== "approved" || course.is_active === false) {
      console.error("[course-featured/create-order] failed", {
        stage,
        instituteId,
        userId: auth.user.id,
        courseId: body.courseId,
        courseStatus: course.status,
        courseIsActive: course.is_active,
        error: "course_not_eligible",
      });
      return NextResponse.json({ error: "Only approved active courses can be featured" }, { status: 400 });
    }
    console.info("[course-featured/create-order] stage", { stage: "content_ok", userId: auth.user.id, instituteId, courseId: body.courseId });

    stage = "plan_resolution";
    const planResolution = await resolveFeaturedPlan({
      admin: admin.data,
      table: "course_featured_plans",
      selectedPlanToken: body.planId,
    });
    const plan = planResolution.plan as PlanRow | null;

    if (!plan || plan.is_active === false) {
      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        courseId: body.courseId,
        selectedPlanToken: body.planId,
        resolution: planResolution.resolution,
        error: "plan_not_found",
      });
      return NextResponse.json(
        {
          error: `Featured plan not found for token "${body.planId.trim()}" in /api/institute/course-featured/create-order`,
          details: { availablePlanTokens: planResolution.availablePlanTokens },
        },
        { status: 404 },
      );
    }

    const { data: canonicalPlan } = await admin.data
      .from("course_featured_plans")
      .select("id,plan_code,code,duration_days,amount,price,currency,is_active,tier_rank")
      .eq("id", String(plan.id))
      .or("is_active.eq.true,is_active.is.null")
      .maybeSingle<PlanRow>();
    const resolvedPlan = canonicalPlan ?? plan;

    const durationDays = toNumber(resolvedPlan.duration_days);
    const amountResolution = resolvePayableAmountRupees(resolvedPlan);
    const amount = amountResolution.payableAmount;
    const currency = typeof resolvedPlan.currency === "string" && resolvedPlan.currency.length > 0 ? resolvedPlan.currency : "INR";

    if (durationDays <= 0 || amount <= 0) {
      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        courseId: body.courseId,
        planId: String(resolvedPlan.id),
        durationDays,
        amount,
        error: "invalid_plan_configuration",
      });
      return NextResponse.json({ error: "Invalid plan configuration" }, { status: 400 });
    }

    console.info("[course-featured/create-order] stage", {
      stage: "plan_ok",
      userId: auth.user.id,
      instituteId,
      courseId: body.courseId,
      selectedPlanToken: body.planId,
      resolvedPlanId: String(resolvedPlan.id),
      resolution: planResolution.resolution,
      amount,
      amountResolutionSource: amountResolution.source,
      planAmountRaw: amountResolution.planAmountRaw,
      planPriceRaw: amountResolution.planPriceRaw,
      currency,
      durationDays,
    });

    const payableAmount = amount;

    stage = "local_order_insert";
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await admin.data
      .from("course_featured_orders")
      .insert({
        institute_id: instituteId,
        created_by: auth.user.id,
        course_id: body.courseId,
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
          source: "course_featured_create_order_api",
          tier_rank: resolvedPlan.tier_rank ?? null,
          plan_resolution: planResolution.resolution,
          razorpay_stage: "not_created",
          payment_method: "razorpay",
        },
        updated_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !inserted?.id) {
      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        courseId: body.courseId,
        planId: String(resolvedPlan.id),
        error: insertError?.message ?? "unknown_insert_error",
      });
      return NextResponse.json({ error: insertError?.message ?? "Unable to persist local order" }, { status: 500 });
    }

    orderId = inserted.id;
    console.info("[course-featured/create-order] stage", {
      stage: "local_order_inserted",
      userId: auth.user.id,
      instituteId,
      courseId: body.courseId,
      localOrderId: orderId,
      planId: String(resolvedPlan.id),
    });

    stage = "razorpay_client_init";
    const razorpay = getRazorpayClient();
    if (!razorpay.ok) {
      await admin.data
        .from("course_featured_orders")
        .update({
          order_status: "failed",
          metadata: {
            source: "course_featured_create_order_api",
            tier_rank: resolvedPlan.tier_rank ?? null,
            plan_resolution: planResolution.resolution,
            razorpay_stage: "client_init_failed",
            razorpay_error: razorpay.error,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .in("order_status", ["pending", "failed"]);

      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        error: razorpay.error,
      });

      return NextResponse.json({ error: razorpay.error, orderId }, { status: 500 });
    }
    console.info("[course-featured/create-order] stage", { stage: "razorpay_client_ok", userId: auth.user.id, instituteId, localOrderId: orderId });

    stage = "razorpay_order_create";
    const receipt = `cf_${orderId.replace(/-/g, "").slice(0, 12)}_${Date.now().toString().slice(-8)}`;

    let order: { id: string; receipt: string | null; amount: number; currency: string };
    try {
      const created = await razorpay.data.orders.create({
        amount: Math.round(payableAmount * 100),
        currency,
        receipt,
        notes: {
          userId: auth.user.id,
          instituteId,
          courseId: body.courseId,
          localOrderId: orderId,
          planId: String(resolvedPlan.id),
          productType: "course_featured_listing",
          payoutEligible: "false",
        },
      });
      order = { id: created.id, receipt: created.receipt ?? null, amount: toNumber(created.amount), currency: String(created.currency ?? currency) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create Razorpay order";
      await admin.data
        .from("course_featured_orders")
        .update({
          order_status: "failed",
          metadata: {
            source: "course_featured_create_order_api",
            tier_rank: resolvedPlan.tier_rank ?? null,
            plan_resolution: planResolution.resolution,
            razorpay_stage: "order_create_failed",
            razorpay_error: message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .in("order_status", ["pending", "failed"]);

      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        courseId: body.courseId,
        planId: String(resolvedPlan.id),
        error: message,
      });

      return NextResponse.json({ error: message, orderId }, { status: 502 });
    }

    console.info("[course-featured/create-order] stage", {
      stage: "razorpay_order_created",
      userId: auth.user.id,
      instituteId,
      localOrderId: orderId,
      razorpayOrderId: order.id,
      receipt: order.receipt,
    });

    stage = "local_order_update";
    const { error: updateError } = await admin.data
      .from("course_featured_orders")
      .update({
        razorpay_order_id: order.id,
        razorpay_receipt: order.receipt ?? receipt,
        metadata: {
          source: "course_featured_create_order_api",
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
      console.error("[course-featured/create-order] failed", {
        stage,
        userId: auth.user.id,
        instituteId,
        localOrderId: orderId,
        razorpayOrderId: order.id,
        error: updateError.message,
      });
      return NextResponse.json({ error: updateError.message, orderId }, { status: 500 });
    }

    console.info("[course-featured/create-order] stage", {
      stage: "local_order_updated",
      userId: auth.user.id,
      instituteId,
      localOrderId: orderId,
      razorpayOrderId: order.id,
    });

    await notifyInstituteAndAdmins({
      admin: admin.data,
      instituteUserId: auth.user.id,
      title: "Course featuring payment initiated",
      message: "A Razorpay order was created for a course featured listing purchase.",
      metadata: { courseId: body.courseId, orderId, planId: String(resolvedPlan.id), razorpayOrderId: order.id },
    });

    console.info("[course-featured/create-order] stage", {
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
        courseId: body.courseId,
        planId: String(resolvedPlan.id),
        durationDays,
        amount,
        currency,
        planCode: resolvedPlan.plan_code ?? resolvedPlan.code ?? "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while creating course featured order";
    console.error("[course-featured/create-order] failed", { stage, instituteId, localOrderId: orderId, error: message });
    return NextResponse.json({ error: message, orderId }, { status: 500 });
  }
}
