import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const [inst, course, webinar] = await Promise.all([
    admin.data.from("featured_listing_orders").select("id,institute_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("course_featured_orders").select("id,institute_id,course_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
    admin.data.from("webinar_featured_orders").select("id,institute_id,webinar_id,plan_id,amount,currency,payment_status,order_status,razorpay_order_id,razorpay_payment_id,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
  ]);
  return NextResponse.json({ instituteOrders: inst.data ?? [], courseOrders: course.data ?? [], webinarOrders: webinar.data ?? [] });
}
