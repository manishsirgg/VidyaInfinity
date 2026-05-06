import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionIds } = await request.json();
  if (!Array.isArray(questionIds)) return NextResponse.json({ error: "questionIds required" }, { status: 400 });
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  await Promise.all(questionIds.map((id: string, index: number) => admin.data.from("psychometric_questions").update({ sort_order: index + 1 }).eq("id", id)));
  return NextResponse.json({ success: true });
}
