import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { calculateCommission } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse();
  if (schemaErrorResponse) return schemaErrorResponse;

  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { webinarId } = (await request.json()) as { webinarId?: string };
  if (!webinarId) return NextResponse.json({ error: "webinarId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,institute_id,webinar_mode,price,currency,approval_status,status")
    .eq("id", webinarId)
    .maybeSingle<{
      id: string;
      title: string;
      institute_id: string;
      webinar_mode: string;
      price: number;
      currency: string;
      approval_status: string;
      status: string;
    }>();

  if (!webinar || webinar.approval_status !== "approved") return NextResponse.json({ error: "Webinar unavailable" }, { status: 404 });
  if (webinar.webinar_mode !== "paid") return NextResponse.json({ error: "This webinar is free" }, { status: 400 });
  if (webinar.status === "cancelled") return NextResponse.json({ error: "This webinar is cancelled" }, { status: 400 });

  const { data: existingPaid } = await admin.data
    .from("webinar_orders")
    .select("id")
    .eq("webinar_id", webinar.id)
    .eq("student_id", auth.user.id)
    .eq("payment_status", "paid")
    .maybeSingle();

  if (existingPaid) return NextResponse.json({ error: "Already purchased" }, { status: 409 });

  const { data: settings } = await admin.data
    .from("platform_commission_settings")
    .select("commission_percentage")
    .eq("key", "default")
    .maybeSingle<{ commission_percentage: number }>();

  const commission = calculateCommission(Number(webinar.price ?? 0), Number(settings?.commission_percentage ?? 12));

  const razorpay = getRazorpayClient();
  if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

  const order = await razorpay.data.orders.create({
    amount: Math.round(commission.grossAmount * 100),
    currency: webinar.currency || "INR",
    receipt: `webinar_${webinar.id.slice(0, 8)}_${Date.now()}`,
    notes: {
      webinarId: webinar.id,
      studentId: auth.user.id,
      instituteId: webinar.institute_id,
    },
  });

  const { data: inserted, error: insertError } = await admin.data
    .from("webinar_orders")
    .insert({
      webinar_id: webinar.id,
      student_id: auth.user.id,
      institute_id: webinar.institute_id,
      amount: commission.grossAmount,
      currency: webinar.currency || "INR",
      payment_status: "pending",
      order_status: "created",
      access_status: "locked",
      platform_fee_percent: commission.commissionPercentage,
      platform_fee_amount: commission.commissionAmount,
      payout_amount: commission.instituteReceivable,
      razorpay_order_id: order.id,
      razorpay_receipt: order.receipt ?? null,
      metadata: { source: "webinar_create_order_api" },
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ order, orderRecordId: inserted.id });
}
