import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getStudentInquiries } from "@/lib/leads/student-inquiries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 500 });
  }

  const { data: profile, error: profileError } = await admin.data
    .from("profiles")
    .select("email,phone")
    .eq("id", auth.user.id)
    .maybeSingle<{ email: string | null; phone: string | null }>();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const inquiries = await getStudentInquiries(admin.data, {
    userId: auth.user.id,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    limit: 100,
  });

  return NextResponse.json({
    inquiries,
    inquiryCount: inquiries.length,
    recentInquiries: inquiries.slice(0, 3),
  });
}
