/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const { questionId } = await params; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: q } = await admin.data.from("psychometric_questions").select("*").eq("id", questionId).single();
  if (!q) return NextResponse.json({ error: "question not found" }, { status: 404 });
  const { id, created_at, updated_at, ...copy } = q;
  const { data: created, error } = await admin.data.from("psychometric_questions").insert({ ...copy, question_text: `${q.question_text} (Copy)` }).select("*").single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "duplicate failed" }, { status: 400 });
  const { data: options } = await admin.data.from("psychometric_question_options").select("*").eq("question_id", questionId);
  if (options?.length) await admin.data.from("psychometric_question_options").insert(options.map(({ id: _id, ...o }) => ({ ...o, question_id: created.id })));
  return NextResponse.json({ data: created });
}
