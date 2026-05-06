import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

const FALLBACK_TEXT = "Not available";

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

  const studentName = report.profiles?.full_name ?? FALLBACK_TEXT;
  const testTitle = report.psychometric_tests?.title ?? "Psychometric Report";
  const generatedAt = new Date(report.generated_at ?? report.created_at).toLocaleString();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <img src="/brand/vidya-infinity-logo.png" alt="Vidya Infinity logo" className="h-16 w-16 rounded-xl border border-white/15 bg-white/5 object-contain p-1" />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vidya Infinity Psychometric Report</p>
                <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{testTitle}</h1>
                <p className="mt-1 text-sm text-slate-200">Global Education Architects</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <p><span className="text-slate-300">Student:</span> {studentName}</p>
              <p><span className="text-slate-300">Generated:</span> {generatedAt || FALLBACK_TEXT}</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[{ label: "Total Score", value: report.total_score ?? FALLBACK_TEXT }, { label: "Max Score", value: report.max_score ?? FALLBACK_TEXT }, { label: "Percentage", value: `${percentage.toFixed(2)}%` }, { label: "Result Band", value: report.result_band ?? FALLBACK_TEXT }].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>Score Progress</span><span>{percentage.toFixed(2)}%</span></div>
            <div className="h-3 w-full rounded-full bg-slate-200"><div className="h-3 rounded-full bg-brand-600" style={{ width: `${percentage}%` }} /></div>
          </div>

          <section className="mt-6 space-y-5">
            <div><h2 className="text-lg font-semibold text-slate-900">Summary</h2><p className="mt-1 text-sm leading-6 text-slate-700">{report.summary || FALLBACK_TEXT}</p></div>
            {dim.length > 0 && <div><h2 className="text-lg font-semibold text-slate-900">Dimension Scores</h2><div className="mt-2 space-y-3">{dim.map(([k, v]) => <div key={k} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between text-sm text-slate-700"><span>{k}</span><span>{v?.score ?? 0}/{v?.maxScore ?? 0} ({v?.percentage ?? 0}%)</span></div><div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, Number(v?.percentage ?? 0)))}%` }} /></div></div>)}</div></div>}
            <div><h3 className="font-medium text-slate-900">Strengths</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{(strengths.length ? strengths : [FALLBACK_TEXT]).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3 className="font-medium text-slate-900">Improvement Areas</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{(improvementAreas.length ? improvementAreas : [FALLBACK_TEXT]).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3 className="font-medium text-slate-900">Recommendations</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{(recommendations.length ? recommendations : [FALLBACK_TEXT]).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
          </section>

          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Disclaimer: {report.disclaimer ?? "This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis."}</p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Vidya Infinity · Global Education Architects</p>
            <p className="mt-1">Website: https://vidyainfinity.com</p>
            <p>Email: infovidyainfinity@gmail.com</p>
            <p>WhatsApp/Call: +91-7828199500</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2"><a href={`/api/psychometric/reports/${reportId}/download`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Download PDF</a><Link href="/dashboard/psychometric" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to My Tests</Link></div>
        </div>
      </div>
    </div>
  );
}
