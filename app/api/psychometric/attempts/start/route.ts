import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { testId } = await request.json();
  if (!testId) return NextResponse.json({ error: "testId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: paidOrder } = await admin.data
    .from("psychometric_orders")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("test_id", testId)
    .eq("payment_status", "paid")
    .maybeSingle();

  if (!paidOrder) return NextResponse.json({ error: "Test is not purchased" }, { status: 403 });

  const { data: attempt, error } = await admin.data
    .from("test_attempts")
    .upsert(
      {
        user_id: auth.user.id,
        test_id: testId,
        status: "in_progress",
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id,test_id" }
    )
    .select("id,status")
    .single();

  if (error || !attempt) return NextResponse.json({ error: error?.message ?? "Unable to create attempt" }, { status: 500 });

  return NextResponse.json({ ok: true, attempt });
}
