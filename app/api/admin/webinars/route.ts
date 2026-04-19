import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const approvalStatus = searchParams.get("approval_status");

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  let query = admin.data
    .from("webinars")
    .select("id,title,starts_at,ends_at,webinar_mode,price,currency,status,approval_status,rejection_reason,institute_id,institutes(name)")
    .order("starts_at", { ascending: true });

  if (approvalStatus && ["pending", "approved", "rejected"].includes(approvalStatus)) {
    query = query.eq("approval_status", approvalStatus);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webinars: data ?? [] });
}
