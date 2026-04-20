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
  id: string;
  course_id: string;
  plan_code: string | null;
  plan_name: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  queued_from_previous: boolean | null;
  amount: number;
  currency: string;
};

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

  const [plansResult, coursesResult, subscriptionsResult, ordersResult] = await Promise.all([
    admin.data.from("course_featured_plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.data
      .from("courses")
      .select("id,title,category,level,status,is_active")
      .eq("institute_id", instituteId)
      .eq("status", "approved")
      .or("is_active.is.null,is_active.eq.true")
      .order("created_at", { ascending: false }),
    admin.data
      .from("course_featured_subscription_summary")
      .select("id,course_id,plan_code,plan_name,starts_at,ends_at,status,queued_from_previous,amount,currency")
      .eq("institute_id", instituteId)
      .order("starts_at", { ascending: false }),
    admin.data
      .from("course_featured_orders")
      .select("id,course_id,plan_id,amount,currency,duration_days,payment_status,order_status,paid_at,created_at,razorpay_order_id,razorpay_payment_id")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false }),
  ]);

  const nowMs = Date.now();
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionSummary[];
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
    plans: parseCourseFeaturedPlans((plansResult.data ?? []) as Array<Record<string, unknown>>),
    courses: (coursesResult.data ?? []) as InstituteCourse[],
    subscriptions,
    orders: ordersResult.data ?? [],
    summary,
  });
}
