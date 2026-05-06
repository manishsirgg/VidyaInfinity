import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Band = { min: number; max: number };

function validateScoringConfig(scoringConfig: unknown): string | null {
  if (scoringConfig == null) return null;
  if (typeof scoringConfig !== "object" || Array.isArray(scoringConfig)) return "scoring_config must be a valid JSON object";
  const bands = (scoringConfig as { bands?: Band[] }).bands;
  if (!bands) return null;
  for (const band of bands) {
    if (band.min < 0 || band.max > 100) return "result bands min/max must be between 0 and 100";
    if (band.min > band.max) return "result band min cannot be greater than max";
  }
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].min <= sorted[i - 1].max) return "result bands must not overlap";
  return null;
}

export async function GET(_:Request,{params}:{params:Promise<{testId:string}>}){const {testId}=await params; const auth=await requireApiUser("admin"); if("error" in auth) return auth.error; const admin=getSupabaseAdmin(); if(!admin.ok) return NextResponse.json({error:admin.error},{status:500}); const {data,error}=await admin.data.from("psychometric_tests").select("*").eq("id",testId).single(); if(error) return NextResponse.json({error:error.message},{status:404}); return NextResponse.json({data});}
export async function PATCH(request:Request,{params}:{params:Promise<{testId:string}>}){const {testId}=await params; const auth=await requireApiUser("admin"); if("error" in auth) return auth.error; const admin=getSupabaseAdmin(); if(!admin.ok) return NextResponse.json({error:admin.error},{status:500}); const body=await request.json(); if(body?.title!==undefined && !String(body.title).trim()) return NextResponse.json({error:"title required"},{status:400}); if(body?.slug!==undefined){if(!String(body.slug).trim()) return NextResponse.json({error:"slug required"},{status:400}); const {data:exists}=await admin.data.from("psychometric_tests").select("id").eq("slug",String(body.slug).trim()).neq("id",testId).maybeSingle(); if(exists) return NextResponse.json({error:"slug must be unique"},{status:400});} if(body?.price!==undefined && Number(body.price)<0) return NextResponse.json({error:"price must be >= 0"},{status:400}); const scoringError=validateScoringConfig(body?.scoring_config); if(scoringError) return NextResponse.json({error:scoringError},{status:400}); const {data,error}=await admin.data.from("psychometric_tests").update(body).eq("id",testId).select("*").single(); if(error) return NextResponse.json({error:error.message},{status:400}); return NextResponse.json({data});}
export async function DELETE(_:Request,{params}:{params:Promise<{testId:string}>}){const {testId}=await params; const auth=await requireApiUser("admin"); if("error" in auth) return auth.error; const admin=getSupabaseAdmin(); if(!admin.ok) return NextResponse.json({error:admin.error},{status:500}); const {error}=await admin.data.from("psychometric_tests").update({is_active:false}).eq("id",testId); if(error) return NextResponse.json({error:error.message},{status:400}); return NextResponse.json({success:true});}
