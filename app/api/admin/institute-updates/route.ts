import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const instituteId = searchParams.get("instituteId");
  let q = admin.data.from("institute_updates").select("*,institutes(name)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (instituteId) q = q.eq("institute_id", instituteId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updates: data ?? [] });
}
