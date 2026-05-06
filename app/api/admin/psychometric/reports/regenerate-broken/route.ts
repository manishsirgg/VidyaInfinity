import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: reports, error } = await admin.data
    .from("psychometric_reports")
    .select("id,attempt_id,total_score")
    .eq("total_score", 0);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const report of reports ?? []) {
    const { data: answers } = await admin.data
      .from("psychometric_answers")
      .select("awarded_score")
      .eq("attempt_id", report.attempt_id);
    const total = (answers ?? []).reduce((sum, a) => sum + Number(a.awarded_score ?? 0), 0);
    if (total > 0) {
      await admin.data.from("psychometric_reports").update({ total_score: total }).eq("id", report.id);
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}
