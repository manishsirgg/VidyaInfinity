import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const status = new URL(request.url).searchParams.get("status")?.trim();
  let query = admin.data.from("course_syllabus_update_requests").select("id,course_id,institute_id,proposed_syllabus_text,proposed_file_path,proposed_file_name,status,rejection_reason,created_at,approved_at,rejected_at,courses(title,syllabus_text,syllabus_file_path),institutes(name)").is("deleted_at", null).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}
