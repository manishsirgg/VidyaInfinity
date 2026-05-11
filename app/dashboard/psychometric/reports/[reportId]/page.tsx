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
      return value
        .includes(",")
        ? value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    }
  }
  return [];
};

const safeObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
};

const sectionCard =
  "rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur sm:p-6";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { profile } = await requireUser();

  if (profile.role === "institute") redirect("/institute/dashboard");
  if (profile.role !== "student" && profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("psychometric_reports")
    .select(
      "id,attempt_id,user_id,total_score,max_score,percentage_score,result_band,summary,strengths,improvement_areas,recommendations,dimension_scores,report_json,generated_at,created_at,psychometric_tests(title),profiles(full_name)",
    )
    .eq("id", reportId)
    .maybeSingle<PsychometricReportRow>();

  if (error) {
    console.error("[psychometric-report-page] load_failed", {
      reportId,
      userId: profile.id,
      reason: error.message,
    });
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Report not found or still generating.</h1>
        <Link href="/dashboard/psychometric" className="mt-6 inline-flex rounded-lg border px-4 py-2 text-sm font-medium">
          Back to My Tests
        </Link>
      </div>
    );
  }

  if (profile.role !== "admin" && report.user_id !== profile.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-slate-600">You do not have permission to view this report.</p>
        <Link href="/dashboard/psychometric" className="mt-6 inline-flex rounded-lg border px-4 py-2 text-sm font-medium">
          Back to My Tests
        </Link>
      </div>
    );
  }

  const dimObj = safeObject(report.dimension_scores);
  const dim = Object.entries(dimObj);
  const percentage = Math.min(100, Math.max(0, safeNumber(report.percentage_score)));
  const strengths = safeArray(report.strengths);
  const improvementAreas = safeArray(report.improvement_areas);
  const recommendations = safeArray(report.recommendations);
  const reportJson = safeObject(report.report_json);
  const disclaimer = String(
    reportJson.disclaimer ??
      "This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.",
  );

  const studentName = report.profiles?.full_name ?? FALLBACK_TEXT;
  const testTitle = report.psychometric_tests?.title ?? "Psychometric Report";
  const generatedAt = safeDate(report.generated_at ?? report.created_at);
  const summary = report.summary ?? String(reportJson.summary ?? FALLBACK_TEXT);

  return (
    <div className="bg-gradient-to-b from-slate-50 to-slate-100/70 py-6 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Psychometric Report</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{testTitle}</h1>
              <p className="mt-2 text-sm text-slate-600">{studentName} · Generated on {generatedAt}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/psychometric"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to My Tests
              </Link>
              <a
                href={`/api/psychometric/reports/${reportId}/download`}
                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Download PDF
              </a>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-100 p-4">
              <p className="text-xs text-slate-500">Total Score</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{safeNumber(report.total_score)}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-4">
              <p className="text-xs text-slate-500">Max Score</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{safeNumber(report.max_score)}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-4">
              <p className="text-xs text-slate-500">Readiness</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{percentage.toFixed(2)}%</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-4">
              <p className="text-xs text-slate-500">Result Band</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{report.result_band ?? FALLBACK_TEXT}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`lg:col-span-2 ${sectionCard}`}>
            <h2 className="text-lg font-semibold text-slate-900">Profile Summary</h2>
            <p className="mt-3 leading-7 text-slate-700">{summary}</p>
          </section>

          <section className={sectionCard}>
            <h2 className="text-lg font-semibold text-slate-900">Dimension Scores</h2>
            <ul className="mt-4 space-y-3">
              {(dim.length ? dim : [[FALLBACK_TEXT, {}]]).map(([name, value]) => {
                const score = safeNumber(safeObject(value).score);
                const maxScore = safeNumber(safeObject(value).maxScore);
                const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                return (
                  <li key={name} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-800">{name.replaceAll("_", " ")}</span>
                      <span className="text-slate-600">
                        {score}/{maxScore}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={sectionCard}>
            <h2 className="text-lg font-semibold text-slate-900">Strengths</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {(strengths.length ? strengths : [FALLBACK_TEXT]).map((item) => (
                <li key={item} className="rounded-lg bg-emerald-50 px-3 py-2">• {item}</li>
              ))}
            </ul>
          </section>

          <section className={sectionCard}>
            <h2 className="text-lg font-semibold text-slate-900">Growth Areas</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {(improvementAreas.length ? improvementAreas : [FALLBACK_TEXT]).map((item) => (
                <li key={item} className="rounded-lg bg-amber-50 px-3 py-2">• {item}</li>
              ))}
            </ul>
          </section>

          <section className={`lg:col-span-3 ${sectionCard}`}>
            <h2 className="text-lg font-semibold text-slate-900">Recommended Next Steps</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(recommendations.length ? recommendations : [FALLBACK_TEXT]).map((item) => (
                <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-6 text-slate-500 shadow-sm">
            {disclaimer}
          </section>
        </div>
      </div>
    </div>
  );
}
