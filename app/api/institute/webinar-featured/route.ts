import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser } from "@/lib/course-featured";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { expireWebinarFeaturedSubscriptionsSafe, isWebinarPromotable, parseWebinarFeaturedPlans } from "@/lib/webinar-featured";

type InstituteWebinar = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  webinar_mode: string;
  price: number;
  currency: string | null;
  approval_status: string;
  status: string;
};

type SubscriptionSummary = {
  id: string;
  webinar_id: string;
  plan_code: string | null;
  plan_name: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  amount: number;
  currency: string;
};

type WebinarFeaturedOrderRow = {
  id: string;
  webinar_id: string;
  plan_id: string | null;
  amount: number;
  currency: string;
  duration_days: number;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
};

export async function GET() {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) {
    return NextResponse.json({ plans: [], webinars: [], subscriptions: [], orders: [], summary: { activeCount: 0, scheduledCount: 0, expiringSoonCount: 0 } });
  }

  await expireWebinarFeaturedSubscriptionsSafe(admin.data);

  const [plansResult, allWebinarsResult, subscriptionsResult, ordersResult] = await Promise.all([
    admin.data.from("webinar_featured_plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.data
      .from("webinars")
      .select("id,title,starts_at,ends_at,webinar_mode,price,currency,approval_status,status")
      .eq("institute_id", instituteId)
      .order("starts_at", { ascending: false }),
    admin.data
      .from("webinar_featured_subscription_summary")
      .select("id,webinar_id,plan_code,plan_name,starts_at,ends_at,status,queued_from_previous,amount,currency")
      .eq("institute_id", instituteId)
      .order("starts_at", { ascending: false }),
    admin.data
      .from("webinar_featured_orders")
      .select("id,webinar_id,plan_id,amount,currency,duration_days,payment_status,order_status,paid_at,created_at,razorpay_order_id,razorpay_payment_id")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false }),
  ]);

  const allWebinars = (allWebinarsResult.data ?? []) as InstituteWebinar[];
  const eligibleWebinars = allWebinars.filter(isWebinarPromotable);
  const webinarTitleById = new Map(allWebinars.map((webinar) => [webinar.id, webinar.title]));

  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionSummary[];
  const orders = (ordersResult.data ?? []) as WebinarFeaturedOrderRow[];

  const historicalPlanIds = [...new Set(orders.map((item) => item.plan_id).filter((item): item is string => typeof item === "string" && item.length > 0))];
  const historicalPlansResult = historicalPlanIds.length
    ? await admin.data.from("webinar_featured_plans").select("id,name,plan_code,code").in("id", historicalPlanIds)
    : { data: [] as Array<{ id: string; name: string | null; plan_code: string | null; code: string | null }> };
  const planNameById = new Map((historicalPlansResult.data ?? []).map((item) => [item.id, item.name ?? item.plan_code ?? item.code ?? "Webinar Plan"]));

  const nowMs = Date.now();
  const summary = {
    activeCount: subscriptions.filter((item) => item.status === "active" && new Date(item.starts_at).getTime() <= nowMs && new Date(item.ends_at).getTime() > nowMs).length,
    scheduledCount: subscriptions.filter((item) => item.status === "scheduled" && new Date(item.starts_at).getTime() > nowMs).length,
    expiringSoonCount: subscriptions.filter((item) => {
      if (item.status !== "active") return false;
      const endMs = new Date(item.ends_at).getTime();
      const diff = endMs - nowMs;
      return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  return NextResponse.json({
    plans: parseWebinarFeaturedPlans((plansResult.data ?? []) as Array<Record<string, unknown>>),
    webinars: eligibleWebinars,
    subscriptions: subscriptions.map((item) => ({
      ...item,
      webinar_title: webinarTitleById.get(item.webinar_id) ?? "Webinar",
      plan_name: item.plan_name ?? item.plan_code ?? "Plan",
    })),
    orders: orders.map((item) => ({
      ...item,
      webinar_title: webinarTitleById.get(item.webinar_id) ?? "Webinar",
      plan_name: item.plan_id ? planNameById.get(item.plan_id) ?? "Plan" : "Plan",
    })),
    summary,
  });
}
