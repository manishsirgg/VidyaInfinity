import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const timeline = searchParams.get("timeline");

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  let query = dataClient
    .from("webinars")
    .select("id,title,starts_at,ends_at,timezone,webinar_mode,price,currency,status,thumbnail_url,institutes(name)")
    .eq("approval_status", "approved")
    .in("status", ["scheduled", "live"])
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

  if (mode === "free" || mode === "paid") query = query.eq("webinar_mode", mode);
  if (timeline === "upcoming") query = query.gte("starts_at", new Date().toISOString());
  if (timeline === "completed") query = query.lt("starts_at", new Date().toISOString());

  const [{ data, error }, { data: featuredRows }] = await Promise.all([
    query.order("starts_at", { ascending: true }),
    dataClient.from("active_featured_webinars").select("webinar_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const featuredWebinarIds = new Set(
    ((featuredRows ?? []) as Array<{ webinar_id: string | null }>)
      .map((item) => item.webinar_id)
      .filter((item): item is string => typeof item === "string" && item.length > 0),
  );

  const webinars = (data ?? []).map((item) => ({ ...item, is_featured: featuredWebinarIds.has(item.id) }));

  return NextResponse.json({ webinars });
}
