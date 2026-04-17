import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const signature = (await headers()).get("x-razorpay-signature") ?? "";
    const raw = await request.text();
    const payload = raw ? JSON.parse(raw) : {};

    const verifyResult = verifyRazorpayWebhookSignature(raw, signature);
    if (!verifyResult.ok) {
      return NextResponse.json({ error: verifyResult.error }, { status: 500 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    await admin.data.from("razorpay_webhook_logs").insert({
      event_id: payload?.payload?.payment?.entity?.id ?? payload?.payload?.order?.entity?.id ?? null,
      event_type: payload?.event ?? "unknown",
      signature_valid: verifyResult.valid,
      payload,
    });

    if (!verifyResult.valid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process webhook" },
      { status: 500 }
    );
  }
}
