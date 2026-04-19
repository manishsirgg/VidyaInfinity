import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("student_cart_items")
    .select("id,course_id,created_at,courses!inner(id,title,summary,fees,status,is_active,admission_deadline)")
    .eq("student_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId } = (await request.json().catch(() => ({}))) as { courseId?: string };
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: course } = await admin.data
    .from("courses")
    .select("id,status,is_active")
    .eq("id", courseId)
    .eq("status", "approved")
    .eq("is_active", true)
    .maybeSingle();

  if (!course) return NextResponse.json({ error: "Course is not available" }, { status: 400 });

  const { error } = await admin.data.from("student_cart_items").upsert(
    {
      student_id: auth.user.id,
      course_id: courseId,
    },
    { onConflict: "student_id,course_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId } = (await request.json().catch(() => ({}))) as { courseId?: string };
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { error } = await admin.data
    .from("student_cart_items")
    .delete()
    .eq("student_id", auth.user.id)
    .eq("course_id", courseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
