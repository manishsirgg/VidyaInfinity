import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { profile } = await requireUser();
  if (profile.role === "institute") redirect("/institute/dashboard");
  if (profile.role !== "student" && profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: report } = await supabase.from("psychometric_reports").select("*,psychometric_tests(title),profiles(full_name)").eq("id", reportId).maybeSingle();
  if (!report) redirect("/dashboard/psychometric");
  if (profile.role !== "admin" && report.user_id !== profile.id) redirect("/dashboard/psychometric");

  const dim = report.dimension_scores && typeof report.dimension_scores === "object" ? Object.entries(report.dimension_scores as Record<string, { score: number; maxScore: number; percentage: number }>) : [];
  const percentage = Math.min(100, Math.max(0, Number(report.percentage_score ?? 0)));
  const strengths: string[] = Array.isArray(report.strengths) ? report.strengths.map((s: unknown) => String(s)) : String(report.strengths ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const improvementAreas: string[] = Array.isArray(report.improvement_areas) ? report.improvement_areas.map((s: unknown) => String(s)) : String(report.improvement_areas ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const recommendations: string[] = Array.isArray(report.recommendations) ? report.recommendations.map((s: unknown) => String(s)) : String(report.recommendations ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Vidya Infinity Psychometric Report</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">{report.psychometric_tests?.title ?? "Psychometric Report"}</h1>
        <p className="mt-2 text-sm text-slate-600">Student: <span className="font-medium text-slate-800">{report.profiles?.full_name ?? "Student"}</span> · Generated: {new Date(report.generated_at ?? report.created_at).toLocaleString()}</p>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[{ label: "Total Score", value: report.total_score ?? 0 }, { label: "Max Score", value: report.max_score ?? 0 }, { label: "Percentage", value: `${percentage.toFixed(2)}%` }, { label: "Result Band", value: report.result_band ?? "N/A" }].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Progress</span><span>{percentage.toFixed(2)}%</span></div>
          <div className="h-3 w-full rounded-full bg-slate-200"><div className="h-3 rounded-full bg-brand-600" style={{ width: `${percentage}%` }} /></div>
        </div>

        <section className="mt-6 space-y-4">
          <div><h2 className="text-lg font-semibold text-slate-900">Summary</h2><p className="mt-1 text-sm leading-6 text-slate-700">{report.summary}</p></div>
          {dim.length > 0 && <div><h2 className="text-lg font-semibold text-slate-900">Dimension Scores</h2><div className="mt-2 space-y-2">{dim.map(([k, v]) => <div key={k}><div className="flex justify-between text-sm text-slate-700"><span>{k}</span><span>{v.score}/{v.maxScore} ({v.percentage}%)</span></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, v.percentage))}%` }} /></div></div>)}</div></div>}
          <div><h3 className="font-medium text-slate-900">Strengths</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{strengths.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="font-medium text-slate-900">Improvement Areas</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{improvementAreas.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="font-medium text-slate-900">Recommendations</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{recommendations.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
        </section>

        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Disclaimer: This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.</p>
        <div className="mt-6 flex flex-wrap gap-2"><a href={`/api/psychometric/reports/${reportId}/download`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Download PDF</a><Link href="/dashboard/psychometric" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to My Tests</Link></div>
      </div>
    </div>
  );
}
