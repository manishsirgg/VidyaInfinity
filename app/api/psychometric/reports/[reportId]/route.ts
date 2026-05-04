import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { reportId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: report, error } = await admin.data
    .from("psychometric_reports")
    .select("*, psychometric_tests(title,category,description), profiles(full_name), test_attempts(id,status,created_at,submitted_at,completed_at)")
    .eq("id", reportId)
    .single();
  if (error || !report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (auth.profile.role !== "admin" && report.user_id !== auth.profile.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, report });
}
