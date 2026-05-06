import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() { const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 }); const { data, error } = await admin.data.from("psychometric_tests").select("*").order("created_at",{ascending:false}); if (error) return NextResponse.json({ error:error.message },{status:500}); return NextResponse.json({ data }); }

export async function POST(request: Request) { const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 }); const body = await request.json(); if (!body?.title) return NextResponse.json({ error: "title required" }, { status: 400 }); const { data, error } = await admin.data.from("psychometric_tests").insert(body).select("*").single(); if (error) return NextResponse.json({ error:error.message },{status:400}); return NextResponse.json({ data }); }
