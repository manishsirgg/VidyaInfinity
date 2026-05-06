import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Band = { min: number; max: number; label?: string };

function validateScoringConfig(scoringConfig: unknown): string | null {
  if (scoringConfig == null) return null;
  if (typeof scoringConfig !== "object" || Array.isArray(scoringConfig)) return "scoring_config must be a valid JSON object";
  const bands = (scoringConfig as { bands?: Band[] }).bands;
  if (!bands) return null;
  for (const band of bands) {
    if (Number.isNaN(Number(band.min)) || Number.isNaN(Number(band.max))) return "result bands min/max must be numeric";
    if (band.min < 0 || band.max > 100) return "result bands min/max must be between 0 and 100";
    if (band.min > band.max) return "result band min cannot be greater than max";
  }
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) return "result bands must not overlap";
  }
  return null;
}

export async function GET() { const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error; const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 }); const { data, error } = await admin.data.from("psychometric_tests").select("*").order("created_at",{ascending:false}); if (error) return NextResponse.json({ error:error.message },{status:500}); return NextResponse.json({ data }); }

export async function POST(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const body = await request.json();
  if (!body?.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!body?.slug?.trim()) return NextResponse.json({ error: "slug required" }, { status: 400 });
  if (Number(body?.price ?? 0) < 0) return NextResponse.json({ error: "price must be >= 0" }, { status: 400 });
  const scoringError = validateScoringConfig(body?.scoring_config);
  if (scoringError) return NextResponse.json({ error: scoringError }, { status: 400 });
  const { data: existingSlug } = await admin.data.from("psychometric_tests").select("id").eq("slug", String(body.slug).trim()).maybeSingle();
  if (existingSlug) return NextResponse.json({ error: "slug must be unique" }, { status: 400 });
  const { data, error } = await admin.data.from("psychometric_tests").insert(body).select("*").single();
  if (error) return NextResponse.json({ error:error.message },{status:400});
  return NextResponse.json({ data });
}
