import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { title, summary, description, feeAmount, mediaUrl } = await request.json();
  if (!title || !summary || !feeAmount) {
    return NextResponse.json({ error: "title, summary, feeAmount are required" }, { status: 400 });
  }

  const { data: institute } = await admin.data.from("institutes").select("id,approval_status").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: course, error } = await admin.data
    .from("courses")
    .insert({
      institute_id: institute.id,
      title,
      slug: `${toSlug(title)}-${crypto.randomUUID().slice(0, 8)}`,
      summary,
      description: description ?? null,
      fee_amount: Number(feeAmount),
      approval_status: "pending",
    })
    .select("id")
    .single();

  if (error || !course) return NextResponse.json({ error: error?.message ?? "Failed to create course" }, { status: 500 });

  if (mediaUrl) {
    const { error: mediaError } = await admin.data.from("course_media").insert({
      course_id: course.id,
      media_type: "image",
      media_url: mediaUrl,
    });
    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, courseId: course.id });
}
