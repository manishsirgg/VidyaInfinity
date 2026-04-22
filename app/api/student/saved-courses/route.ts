import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: courseItems, error: coursesError } = await admin.data
    .from("student_saved_courses")
    .select("id,course_id,created_at,courses!inner(id,title,summary,fees,status,is_active)")
    .eq("student_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (coursesError) return NextResponse.json({ error: coursesError.message }, { status: 500 });

  const { data: webinarItems, error: webinarsError } = await admin.data
    .from("student_saved_webinars")
    .select("id,webinar_id,created_at,webinars!inner(id,title,description,starts_at,webinar_mode,price,currency,approval_status,status,is_public)")
    .eq("student_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (webinarsError) return NextResponse.json({ error: webinarsError.message }, { status: 500 });

  return NextResponse.json({ items: courseItems ?? [], courseItems: courseItems ?? [], webinarItems: webinarItems ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId, webinarId } = (await request.json().catch(() => ({}))) as { courseId?: string; webinarId?: string };
  if (!courseId && !webinarId) return NextResponse.json({ error: "courseId or webinarId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  if (courseId) {
    const { error } = await admin.data.from("student_saved_courses").upsert(
      {
        student_id: auth.user.id,
        course_id: courseId,
      },
      { onConflict: "student_id,course_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (webinarId) {
    const { error } = await admin.data.from("student_saved_webinars").upsert(
      {
        student_id: auth.user.id,
        webinar_id: webinarId,
      },
      { onConflict: "student_id,webinar_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { courseId, webinarId } = (await request.json().catch(() => ({}))) as { courseId?: string; webinarId?: string };
  if (!courseId && !webinarId) return NextResponse.json({ error: "courseId or webinarId is required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  if (courseId) {
    const { error } = await admin.data
      .from("student_saved_courses")
      .delete()
      .eq("student_id", auth.user.id)
      .eq("course_id", courseId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (webinarId) {
    const { error } = await admin.data
      .from("student_saved_webinars")
      .delete()
      .eq("student_id", auth.user.id)
      .eq("webinar_id", webinarId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
