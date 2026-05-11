import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

const FALLBACK_TEXT = "Not available";

type PsychometricReportRow = {
  id: string;
  attempt_id: string | null;
  user_id: string;
  total_score: number | null;
  max_score: number | null;
  percentage_score: number | null;
  result_band: string | null;
  summary: string | null;
  strengths: unknown;
  improvement_areas: unknown;
  recommendations: unknown;
  dimension_scores: unknown;
  report_json: unknown;
  generated_at: string | null;
  created_at: string | null;
  psychometric_tests?: { title: string | null } | null;
  profiles?: { full_name: string | null } | null;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const safeDate = (value: unknown) => {
  const dt = new Date(String(value ?? ""));
  return Number.isNaN(dt.getTime()) ? FALLBACK_TEXT : dt.toLocaleString();
};
const safeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return value.includes(",") ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
    }
  }
  return [];
};
const safeObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
};

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { profile } = await requireUser();
  if (profile.role === "institute") redirect("/institute/dashboard");
  if (profile.role !== "student" && profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("psychometric_reports")
    .select("id,attempt_id,user_id,total_score,max_score,percentage_score,result_band,summary,strengths,improvement_areas,recommendations,dimension_scores,report_json,generated_at,created_at,psychometric_tests(title),profiles(full_name)")
    .eq("id", reportId)
    .maybeSingle<PsychometricReportRow>();

  if (error) {
    console.error("[psychometric-report-page] load_failed", { reportId, userId: profile.id, reason: error.message });
  }

  if (!report) {
    return <div className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Report not found or still generating.</h1><Link href="/dashboard/psychometric" className="mt-4 inline-block rounded border px-4 py-2">Back to My Tests</Link></div>;
  }
  if (profile.role !== "admin" && report.user_id !== profile.id) {
    return <div className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-2 text-slate-600">You do not have permission to view this report.</p><Link href="/dashboard/psychometric" className="mt-4 inline-block rounded border px-4 py-2">Back to My Tests</Link></div>;
  }

  const dimObj = safeObject(report.dimension_scores);
  const dim = Object.entries(dimObj);
  const percentage = Math.min(100, Math.max(0, safeNumber(report.percentage_score)));
  const strengths = safeArray(report.strengths);
  const improvementAreas = safeArray(report.improvement_areas);
  const recommendations = safeArray(report.recommendations);
  const reportJson = safeObject(report.report_json);
  const disclaimer = String(reportJson.disclaimer ?? "This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.");

  const studentName = report.profiles?.full_name ?? FALLBACK_TEXT;
  const testTitle = report.psychometric_tests?.title ?? "Psychometric Report";
  const generatedAt = safeDate(report.generated_at ?? report.created_at);

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><h1 className="text-2xl font-semibold">{testTitle}</h1><p>{studentName} · {generatedAt}</p><p>Total: {safeNumber(report.total_score)} / {safeNumber(report.max_score)} · {percentage.toFixed(2)}% · {report.result_band ?? FALLBACK_TEXT}</p><p>{report.summary ?? String(reportJson.summary ?? FALLBACK_TEXT)}</p><div>{dim.map(([k,v]) => <p key={k}>{k}: {safeNumber(safeObject(v).score)}/{safeNumber(safeObject(v).maxScore)}</p>)}</div><ul>{(strengths.length?strengths:[FALLBACK_TEXT]).map((x)=> <li key={x}>{x}</li>)}</ul><ul>{(improvementAreas.length?improvementAreas:[FALLBACK_TEXT]).map((x)=> <li key={x}>{x}</li>)}</ul><ul>{(recommendations.length?recommendations:[FALLBACK_TEXT]).map((x)=> <li key={x}>{x}</li>)}</ul><p>{disclaimer}</p><a href={`/api/psychometric/reports/${reportId}/download`}>Download PDF</a></div>;
}
