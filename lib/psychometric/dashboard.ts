export type AttemptLite = {
  id: string;
  status: string | null;
  report_id: string | null;
  legacy_report_url?: string | null;
};

export type ReportLite = { id: string; attempt_id: string | null; created_at?: string | null };

export const isPaidPsychometricOrder = (status: string | null, paidAt: string | null) =>
  ["paid", "success", "captured", "confirmed"].includes(String(status ?? "").toLowerCase()) || Boolean(paidAt);

export function resolveAttemptReportId(attempt: AttemptLite | null | undefined, reportsByAttemptId: Map<string, ReportLite>): string | null {
  if (!attempt) return null;
  if (attempt.report_id) return attempt.report_id;
  return reportsByAttemptId.get(attempt.id)?.id ?? null;
}

export function derivePsychometricState(input: {
  paid: boolean;
  attempt: AttemptLite | null;
  resolvedReportId: string | null;
  hasLegacyReportUrl: boolean;
}) {
  const { paid, attempt, resolvedReportId, hasLegacyReportUrl } = input;
  if (!paid) return "payment_pending" as const;
  if (resolvedReportId) return "report_ready" as const;
  if (!attempt) return "paid_attempt_missing" as const;
  const status = String(attempt.status ?? "").toLowerCase();
  if (status === "in_progress") return "in_progress" as const;
  if (["not_started", "unlocked", "created"].includes(status)) return "ready_to_start" as const;
  if (status === "completed") return hasLegacyReportUrl ? "legacy_report_only" as const : "completed_report_pending" as const;
  return "unknown" as const;
}
