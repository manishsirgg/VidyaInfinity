import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!institute) {
    return NextResponse.json({ webinars: [] });
  }

  const { data, error } = await dataClient
    .from("webinars")
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,registration_url,status,created_at")
    .eq("institute_id", institute.id)
    .order("starts_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ webinars: data ?? [] });
}

export async function POST(request: Request) {
  const { user } = await requireUser("institute");
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
    timezone?: string;
    mode?: "free" | "paid";
    price?: number;
    meetingUrl?: string;
    registrationUrl?: string;
  };

  if (!body.title || !body.startsAt) {
    return NextResponse.json({ error: "Title and start date are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!institute) {
    return NextResponse.json({ error: "Institute profile not found." }, { status: 404 });
  }

  const mode = body.mode === "paid" ? "paid" : "free";
  const price = mode === "paid" ? Math.max(Number(body.price ?? 0), 1) : 0;

  const { data, error } = await dataClient
    .from("webinars")
    .insert({
      institute_id: institute.id,
      created_by: user.id,
      title: body.title.trim(),
      description: body.description?.trim() ?? null,
      starts_at: body.startsAt,
      ends_at: body.endsAt || null,
      timezone: body.timezone || "Asia/Kolkata",
      webinar_mode: mode,
      price,
      meeting_url: body.meetingUrl?.trim() || null,
      registration_url: body.registrationUrl?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
