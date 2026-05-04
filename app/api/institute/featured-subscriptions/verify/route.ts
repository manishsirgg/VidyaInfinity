import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { activateFeaturedSubscriptionFromPaidOrder } from "@/lib/featured-reconciliation";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type FeaturedOrderRow = {
  id: string;
  institute_id: string;
  payment_status: string;
  razorpay_order_id: string;
  is_upgrade: boolean | null;
  metadata?: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { orderId, paymentId, signature } = (await request.json()) as { orderId?: string; paymentId?: string; signature?: string };
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  let { data: existingOrder } = await admin.data
    .from("featured_listing_orders")
    .select("id,institute_id,payment_status,razorpay_order_id,is_upgrade,metadata")
    .eq("razorpay_order_id", orderId)
    .eq("institute_id", institute.id)
    .maybeSingle<FeaturedOrderRow>();

  if (!existingOrder) {
    const fallback = await admin.data.from("featured_listing_orders").select("id,institute_id,payment_status,razorpay_order_id,is_upgrade,metadata").eq("id", orderId).eq("institute_id", institute.id).maybeSingle<FeaturedOrderRow>();
    existingOrder = fallback.data ?? null;
  }
  if (!existingOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const alreadyPaid = isSuccessfulPaymentStatus(existingOrder.payment_status);
  if (!alreadyPaid) {
    if (!paymentId || !signature) return NextResponse.json({ error: "paymentId and signature are required for Razorpay payments" }, { status: 400 });

    const signatureResult = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!signatureResult.ok) return NextResponse.json({ error: signatureResult.error }, { status: 500 });
    if (!signatureResult.valid) {
      await admin.data.from("featured_listing_orders").update({ payment_status: "failed", order_status: "cancelled", failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", existingOrder.id);
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const paidAt = new Date().toISOString();
    const { error: orderUpdateError } = await admin.data
      .from("featured_listing_orders")
      .update({ payment_status: "paid", order_status: "confirmed", paid_at: paidAt, updated_at: paidAt, razorpay_payment_id: paymentId, razorpay_signature: signature })
      .eq("id", existingOrder.id)
      .in("payment_status", ["pending", "failed"]);
    if (orderUpdateError) return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });
  }

  const activation = await activateFeaturedSubscriptionFromPaidOrder({
    supabase: admin.data,
    orderType: "institute",
    orderId: existingOrder.id,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    source: "verify",
    actorUserId: auth.user.id,
    reason: "Institute featured payment verification",
  });
  if (!activation.ok) return NextResponse.json({ payment_received: true, activation_status: "needs_reconciliation", message: "Payment received. Activation is being reconciled.", orderId: existingOrder.id, error: activation.error }, { status: 202 });

  await createAccountNotification({
    userId: auth.user.id,
    type: "approval",
    title: Boolean(existingOrder.is_upgrade) ? "Featured listing upgraded" : "Featured listing activated",
    message: Boolean(existingOrder.is_upgrade)
      ? "Upgrade successful. Your new featured plan is active immediately."
      : "Your featured listing is now active and visible on discovery pages.",
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, idempotent: Boolean(activation.idempotent), status: "active", isUpgrade: Boolean(existingOrder.is_upgrade) });
}
