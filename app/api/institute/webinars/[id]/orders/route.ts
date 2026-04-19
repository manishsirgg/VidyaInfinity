import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getInstituteId(userId: string) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data } = await dataClient.from("institutes").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: webinar } = await dataClient.from("webinars").select("id").eq("id", id).eq("institute_id", instituteId).maybeSingle();
  if (!webinar) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  const { data, error } = await dataClient
    .from("webinar_orders")
    .select("id,student_id,amount,currency,payment_status,order_status,access_status,paid_at,platform_fee_amount,payout_amount,created_at,profiles!webinar_orders_student_id_fkey(full_name,email,phone)")
    .eq("webinar_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}
