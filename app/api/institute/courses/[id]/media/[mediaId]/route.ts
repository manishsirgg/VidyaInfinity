import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string; mediaId: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id: courseId, mediaId } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course } = await admin.data
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("institute_id", institute.id)
    .maybeSingle<{ id: string }>();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data: media } = await admin.data
    .from("course_media")
    .select("id,storage_path")
    .eq("id", mediaId)
    .eq("course_id", course.id)
    .maybeSingle<{ id: string; storage_path: string | null }>();

  if (!media) return NextResponse.json({ error: "Media not found" }, { status: 404 });

  if (media.storage_path) {
    await admin.data.storage.from("course-media").remove([media.storage_path]);
  }

  const { error } = await admin.data.from("course_media").delete().eq("id", media.id).eq("course_id", course.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
