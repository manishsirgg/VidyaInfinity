import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getInstituteIdForUser, parseCourseFeaturedPlans } from "@/lib/course-featured";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type InstituteCourse = {
  id: string;
  title: string;
  category: string | null;
  level: string | null;
  status: string;
  is_active: boolean | null;
};

type SubscriptionSummary = {
  subscription_id: string;
  course_id: string;
  plan_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

type SubscriptionDetails = {
  id: string;
  plan_id: string | null;
  amount: number | null;
  currency: string | null;
  queued_from_previous: boolean | null;
};

type CourseFeaturedOrderRow = {
  id: string;
  course_id: string;
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

function normalizePlanToken(value: string) {
  return value.trim().toLowerCase();
}

export async function GET() {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const instituteId = await getInstituteIdForUser(admin.data, auth.user.id);
  if (!instituteId) {
    return NextResponse.json({ plans: [], courses: [], subscriptions: [], orders: [], summary: { activeCount: 0, scheduledCount: 0, expiringSoonCount: 0 } });
  }

  try {
    await admin.data.rpc("expire_course_featured_subscriptions");
  } catch {
    // ignore cleanup failures on read path
  }

  const [plansResult, allCoursesResult, subscriptionsResult, ordersResult] = await Promise.all([
    admin.data.from("course_featured_plans").select("*").or("is_active.eq.true,is_active.is.null").order("sort_order", { ascending: true }),
    admin.data.from("courses").select("id,title,category,level,status,is_active").eq("institute_id", instituteId).order("created_at", { ascending: false }),
    admin.data.from("course_featured_subscription_summary").select("subscription_id,course_id,plan_code,starts_at,ends_at,status").eq("institute_id", instituteId).order("starts_at", { ascending: false }),
    admin.data
      .from("course_featured_orders")
      .select("id,course_id,plan_id,amount,currency,duration_days,payment_status,order_status,paid_at,created_at,razorpay_order_id,razorpay_payment_id")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false }),
  ]);

  const allCourses = (allCoursesResult.data ?? []) as InstituteCourse[];
  const eligibleCourses = allCourses.filter((course) => course.status === "approved" && course.is_active !== false);
  const courseTitleById = new Map(allCourses.map((course) => [course.id, course.title]));

  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionSummary[];
  const subscriptionIds = subscriptions.map((item) => item.subscription_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const subscriptionDetailsResult = subscriptionIds.length
    ? await admin.data.from("course_featured_subscriptions").select("id,plan_id,amount,currency,queued_from_previous").in("id", subscriptionIds)
    : { data: [] as SubscriptionDetails[] };
  const subscriptionDetailsById = new Map<string, SubscriptionDetails>(
    ((subscriptionDetailsResult.data ?? []) as SubscriptionDetails[]).map((row) => [row.id, row]),
  );
  const orders = (ordersResult.data ?? []) as CourseFeaturedOrderRow[];

  const historicalPlanRowsResult = await admin.data.from("course_featured_plans").select("id,name,plan_code");
  const planRows = (historicalPlanRowsResult.data ?? []) as Array<{ id: string; name: string | null; plan_code: string | null }>;
  const planNameByToken = new Map<string, string>();
  for (const item of planRows) {
    const planName = item.name ?? item.plan_code ?? "Course Plan";
    for (const token of [item.id, item.plan_code]) {
      if (typeof token === "string" && token.length > 0) planNameByToken.set(normalizePlanToken(token), planName);
    }
  }

  const nowMs = Date.now();
  const isWindowActive = (item: Pick<SubscriptionSummary, "starts_at" | "ends_at">) => {
    const startMs = new Date(item.starts_at).getTime();
    const endMs = new Date(item.ends_at).getTime();
    return startMs <= nowMs && endMs > nowMs;
  };
  const isWindowScheduled = (item: Pick<SubscriptionSummary, "starts_at">) => new Date(item.starts_at).getTime() > nowMs;

  const summary = {
    activeCount: subscriptions.filter((item) => isWindowActive(item)).length,
    scheduledCount: subscriptions.filter((item) => !isWindowActive(item) && isWindowScheduled(item)).length,
    expiringSoonCount: subscriptions.filter((item) => {
      if (!isWindowActive(item)) return false;
      const endMs = new Date(item.ends_at).getTime();
      const diff = endMs - nowMs;
      return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  return NextResponse.json({
    plans: parseCourseFeaturedPlans((plansResult.data ?? []) as Array<Record<string, unknown>>),
    courses: eligibleCourses,
    subscriptions: subscriptions.map((item) => ({
      id: item.subscription_id,
      course_id: item.course_id,
      plan_id: subscriptionDetailsById.get(item.subscription_id)?.plan_id ?? null,
      plan_code: item.plan_code,
      course_title: courseTitleById.get(item.course_id) ?? "Course",
      plan_name: item.plan_code ?? "Plan",
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      status: item.status,
      queued_from_previous: subscriptionDetailsById.get(item.subscription_id)?.queued_from_previous ?? false,
      amount: Number(subscriptionDetailsById.get(item.subscription_id)?.amount ?? 0),
      currency: subscriptionDetailsById.get(item.subscription_id)?.currency ?? "INR",
    })),
    orders: orders.map((item) => ({
      ...item,
      course_title: courseTitleById.get(item.course_id) ?? "Course",
      plan_name: item.plan_id ? planNameByToken.get(normalizePlanToken(item.plan_id)) ?? "Plan" : "Plan",
    })),
    summary,
  });
}
