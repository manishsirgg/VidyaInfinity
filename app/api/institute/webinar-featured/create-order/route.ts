import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isWebinarPromotable } from "@/lib/webinar-featured";

type RequestBody = {
  webinarId?: string;
  planId?: string;
};

type PlanRow = {
  id: string;
  plan_code: string | null;
  code: string | null;
  duration_days: number;
  amount: number | null;
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

function normalizePlanToken(value: string) {
  return value.trim().toLowerCase();
}

function resolvePlanByToken(plans: PlanRow[], token: string) {
  const normalized = normalizePlanToken(token);
  return plans.find((plan) => {
    const tokens = [plan.id, plan.plan_code, plan.code].filter((item): item is string => typeof item === "string" && item.length > 0);
    return tokens.some((item) => normalizePlanToken(item) === normalized);
  }) ?? null;
}

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

  const body = (await request.json()) as RequestBody;
  if (!body.planId || !body.webinarId) {
    return NextResponse.json({ error: "webinarId and planId are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const [{ data: webinar }, { data: planRows }] = await Promise.all([
    admin.data
      .from("webinars")
      .select("id,institute_id,approval_status,status,ends_at")
      .eq("id", body.webinarId)
      .eq("institute_id", instituteId)
      .maybeSingle<WebinarRow>(),
    admin.data
      .from("webinar_featured_plans")
      .select("id,plan_code,code,duration_days,amount,price,currency,is_active,tier_rank")
      .or("is_active.eq.true,is_active.is.null")
      .order("sort_order", { ascending: true }),
  ]);
  const plan = resolvePlanByToken((planRows ?? []) as PlanRow[], body.planId);

  if (!webinar) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  if (!isWebinarPromotable(webinar)) {
    return NextResponse.json({ error: "Only approved scheduled/live webinars with valid end dates can be promoted" }, { status: 400 });
  }

  if (!plan || plan.is_active === false) return NextResponse.json({ error: "Featured plan not found" }, { status: 404 });

  const durationDays = toNumber(plan.duration_days);
  const amount = toNumber(plan.amount ?? plan.price);
  const currency = typeof plan.currency === "string" && plan.currency.length > 0 ? plan.currency : "INR";

  if (durationDays <= 0 || amount <= 0) {
    return NextResponse.json({ error: "Invalid plan configuration" }, { status: 400 });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  const receipt = `webinar_featured_${body.webinarId.slice(0, 8)}_${Date.now()}`;
  let order: { id: string; receipt: string | null };
  try {
    const created = await razorpay.data.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes: {
        userId: auth.user.id,
        instituteId,
        webinarId: body.webinarId,
        planId: plan.id,
        productType: "webinar_featured_listing",
        payoutEligible: "false",
      },
    });
    order = { id: created.id, receipt: created.receipt ?? null };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Razorpay order" },
      { status: 502 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin.data
    .from("webinar_featured_orders")
    .insert({
      institute_id: instituteId,
      created_by: auth.user.id,
      webinar_id: body.webinarId,
      plan_id: plan.id,
      amount,
      currency,
      duration_days: durationDays,
      payment_status: "pending",
      order_status: "pending",
      razorpay_order_id: order.id,
      razorpay_receipt: order.receipt ?? receipt,
      metadata: {
        source: "webinar_featured_create_order_api",
        tier_rank: plan.tier_rank ?? null,
      },
      updated_at: nowIso,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    order,
    purchase: {
      id: inserted.id,
      webinarId: body.webinarId,
      planId: plan.id,
      durationDays,
      amount,
      currency,
      planCode: plan.plan_code ?? plan.code ?? "",
    },
  });
}
