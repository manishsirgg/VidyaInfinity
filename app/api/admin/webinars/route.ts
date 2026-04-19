import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("webinars")
    .select("id,title,starts_at,ends_at,webinar_mode,price,status,institute_id,institutes(name)")
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webinars: data ?? [] });
}
