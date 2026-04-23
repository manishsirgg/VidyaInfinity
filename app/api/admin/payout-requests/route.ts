import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data.from("institute_payout_requests").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const instituteIds = [...new Set((data ?? []).map((row) => row.institute_id).filter((value): value is string => Boolean(value)))];
  const { data: institutes, error: instituteError } = instituteIds.length
    ? await admin.data.from("institutes").select("id,name,user_id").in("id", instituteIds)
    : { data: [], error: null };
  if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });

  const instituteById = new Map((institutes ?? []).map((item) => [item.id, item]));
  return NextResponse.json({ payout_requests: (data ?? []).map((item) => ({ ...item, institutes: instituteById.get(item.institute_id) ?? null })) });
}
