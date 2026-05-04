import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { buildReportContent, pickResultBand } from "@/lib/psychometric/reporting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const isPaid=(s:string|null,p:string|null)=>["paid","success","captured","confirmed"].includes(String(s??"").toLowerCase())||Boolean(p);

export async function POST(){const auth=await requireApiUser("admin"); if("error" in auth) return auth.error; const admin=getSupabaseAdmin(); if(!admin.ok) return NextResponse.json({error:admin.error},{status:500});
const result={success:true,repairedOrders:0,createdAttempts:0,linkedAttempts:0,createdReports:0,skipped:0,warnings:[] as string[]};
const {data:orders}=await admin.data.from("psychometric_orders").select("id,user_id,test_id,attempt_id,payment_status,paid_at").is("attempt_id",null).limit(500);
for(const o of orders??[]){if(!isPaid(o.payment_status,o.paid_at)){result.skipped++; continue;} const {data:existing}=await admin.data.from("test_attempts").select("id").eq("order_id",o.id).maybeSingle(); const attemptId=existing?.id??crypto.randomUUID(); if(!existing){const {error}=await admin.data.from("test_attempts").insert({id:attemptId,user_id:o.user_id,test_id:o.test_id,order_id:o.id,status:"not_started"}); if(error){result.warnings.push(`attempt_create_failed:${o.id}`); continue;} result.createdAttempts++;} await admin.data.from("psychometric_orders").update({attempt_id:attemptId}).eq("id",o.id); result.linkedAttempts++; result.repairedOrders++;}
const {data:attempts}=await admin.data.from("test_attempts").select("id,user_id,test_id,order_id,status,total_score,max_score,percentage_score,result_band").eq("status","completed").is("report_id",null).limit(500);
for(const a of attempts??[]){const {data:ans}=await admin.data.from("psychometric_answers").select("id").eq("attempt_id",a.id).limit(1); if(!ans?.length){result.skipped++; continue;} const percentage=Number(a.percentage_score??0); const resultBand=String(a.result_band??pickResultBand(percentage)); const content=buildReportContent({testTitle:"Psychometric Test",percentage,resultBand}); const {data:report,error}=await admin.data.from("psychometric_reports").upsert({attempt_id:a.id,test_id:a.test_id,user_id:a.user_id,order_id:a.order_id,total_score:a.total_score??0,max_score:a.max_score??0,percentage_score:percentage,result_band:resultBand,summary:content.summary,strengths:content.strengths,improvement_areas:content.improvementAreas,recommendations:content.recommendations,generated_at:new Date().toISOString()},{onConflict:"attempt_id"}).select("id").single(); if(error||!report){result.warnings.push(`report_upsert_failed:${a.id}`); continue;} await admin.data.from("test_attempts").update({report_id:report.id}).eq("id",a.id); result.createdReports++;}
return NextResponse.json(result);
}
