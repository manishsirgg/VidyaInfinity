import { NextResponse } from "next/server";

import { featuredInstitutePlans } from "@/lib/institute/featured-plans";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!institute) return NextResponse.json({ subscriptions: [] });

  const { data, error } = await dataClient
    .from("institute_featured_subscriptions")
    .select("id,plan_code,amount,currency,duration_days,starts_at,ends_at,status,lead_boost_note,created_at")
    .eq("institute_id", institute.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [], plans: featuredInstitutePlans });
}

export async function POST(request: Request) {
  const { user } = await requireUser("institute");
  const body = (await request.json()) as { planCode?: string };
  const plan = featuredInstitutePlans.find((item) => item.code === body.planCode);

  if (!plan) return NextResponse.json({ error: "Invalid plan." }, { status: 400 });

  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute profile not found." }, { status: 404 });

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  const { data, error } = await dataClient
    .from("institute_featured_subscriptions")
    .insert({
      institute_id: institute.id,
      created_by: user.id,
      plan_code: plan.code,
      amount: plan.amount,
      duration_days: plan.durationDays,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
      lead_boost_note: "Featured boost enabled: priority listing placement and higher lead visibility.",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
