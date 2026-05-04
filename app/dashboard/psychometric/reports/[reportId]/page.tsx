import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page({params}:{params:Promise<{reportId:string}>}){
  const {reportId}=await params;
  const {profile}=await requireUser();
  if (profile.role === "institute") redirect("/institute/dashboard");
  if (profile.role !== "student" && profile.role !== "admin") redirect("/");
  const supabase=await createClient();
  const {data:report}=await supabase.from("psychometric_reports").select("*,psychometric_tests(title),profiles(full_name)").eq("id",reportId).maybeSingle();
  if(!report) redirect("/dashboard/psychometric");
  if(profile.role!=="admin"&&report.user_id!==profile.id) redirect("/dashboard/psychometric");
  const dim=report.dimension_scores&&typeof report.dimension_scores==="object"?Object.entries(report.dimension_scores as Record<string,{score:number;maxScore:number;percentage:number}>):[];
  return <div className="mx-auto max-w-4xl px-4 py-8"><div className="rounded-xl border bg-white p-6"><p className="text-xs uppercase tracking-wide text-brand-600">Vidya Infinity</p><h1 className="text-2xl font-semibold">{report.psychometric_tests?.title??"Psychometric Report"}</h1><p className="text-sm text-slate-600">Student: {report.profiles?.full_name??"Student"} · Generated: {new Date(report.generated_at).toLocaleString()}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-slate-500">Total</p><p className="font-semibold">{report.total_score}</p></div><div><p className="text-slate-500">Max</p><p className="font-semibold">{report.max_score}</p></div><div><p className="text-slate-500">Percentage</p><p className="font-semibold">{report.percentage_score}%</p></div><div><p className="text-slate-500">Band</p><p className="font-semibold">{report.result_band??"N/A"}</p></div></div><p className="mt-4"><b>Summary:</b> {report.summary}</p><div className="mt-4"><h2 className="font-medium">Dimension Scores</h2><div className="mt-2 space-y-2">{dim.map(([k,v])=><div key={k}><div className="flex justify-between text-sm"><span>{k}</span><span>{v.score}/{v.maxScore} ({v.percentage}%)</span></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{width:`${Math.min(100,Math.max(0,v.percentage))}%`}}/></div></div>)}</div></div><p className="mt-4 text-sm"><b>Strengths:</b> {Array.isArray(report.strengths)?report.strengths.join(", "):report.strengths}</p><p className="text-sm"><b>Improvement Areas:</b> {Array.isArray(report.improvement_areas)?report.improvement_areas.join(", "):report.improvement_areas}</p><p className="text-sm"><b>Recommendations:</b> {Array.isArray(report.recommendations)?report.recommendations.join(", "):report.recommendations}</p><p className="mt-4 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Disclaimer: This report is for educational and guidance purposes only.</p><div className="mt-5 flex gap-2"><a href={`/api/psychometric/reports/${reportId}/download`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Download PDF</a><Link href="/dashboard/psychometric" className="rounded border px-3 py-2 text-sm">Back to Dashboard</Link></div></div></div>;
}
