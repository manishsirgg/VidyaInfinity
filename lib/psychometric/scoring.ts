import { buildReportContent, pickResultBand } from "@/lib/psychometric/reporting";

type OptionRow = { id: string; question_id: string; option_text?: string | null; score_value: number | null; metadata: Record<string, unknown> | null };
type AnswerRow = { id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null; awarded_score: number | string | null };
type QuestionRow = { id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null; scoring_config: Record<string, unknown> | null };
type TestRow = { title: string | null; scoring_config: Record<string, unknown> | null };

export class PsychometricScoringError extends Error {}

export function computePsychometricReportData(params: {
  test: TestRow;
  questions: QuestionRow[];
  options: OptionRow[];
  answers: AnswerRow[];
  enforceRequired: boolean;
}) {
  const { test, questions, options, answers, enforceRequired } = params;
  const optsByQ = new Map<string, OptionRow[]>();
  options.forEach((o) => optsByQ.set(o.question_id, [...(optsByQ.get(o.question_id) ?? []), o]));
  const ansByQ = new Map(answers.map((a) => [a.question_id, a]));

  let max = 0;
  const dimension: Record<string, { score: number; maxScore: number; percentage: number }> = {};
  const snapshot: Array<Record<string, unknown>> = [];
  const awardedScoresByAnswerId: Record<string, number> = {};

  for (const q of questions) {
    const a = ansByQ.get(q.id);
    const qOpts = optsByQ.get(q.id) ?? [];
    const weight = Number(q.weight ?? 1);
    if (q.is_required && !a && enforceRequired) {
      throw new PsychometricScoringError(`Required question unanswered: ${q.question_text}`);
    }

    let awarded = 0;
    let qMax = 0;
    const questionScoringConfig = (q.scoring_config as Record<string, unknown> | null) ?? {};
    if (q.question_type === "single_choice") {
      qMax = Math.max(0, ...qOpts.map((o) => Number(o.score_value ?? 0))) * weight;
      if (q.is_required && !a?.option_id && enforceRequired) throw new PsychometricScoringError("Single choice answer required");
      if (a?.option_id) {
        const op = qOpts.find((o) => o.id === a.option_id);
        if (!op && q.is_required && enforceRequired) throw new PsychometricScoringError("Invalid single choice answer");
        awarded = Number(op?.score_value ?? 0) * weight;
      }
    }
    if (q.question_type === "multiple_choice") {
      qMax = qOpts.reduce((s, o) => s + Math.max(0, Number(o.score_value ?? 0)), 0) * weight;
      const vals = Array.isArray(a?.selected_values) ? a.selected_values : [];
      if (q.is_required && vals.length === 0 && enforceRequired) throw new PsychometricScoringError("At least one option must be selected");
      const selected = qOpts.filter((o) => vals.includes(o.id));
      if (q.is_required && selected.length !== vals.length && enforceRequired) throw new PsychometricScoringError("Invalid multi choice answer");
      awarded = selected.reduce((s, o) => s + Number(o.score_value ?? 0), 0) * weight;
    }
    if (q.question_type === "scale") {
      const testScoringConfig = (test.scoring_config as Record<string, unknown> | null) ?? {};
      const configuredScaleMax = Number(questionScoringConfig.max_scale_value ?? questionScoringConfig.max ?? testScoringConfig.scale_max ?? q.max_scale_value ?? 0);
      qMax = Math.max(0, configuredScaleMax) * weight;
      const n = Number(a?.numeric_value);
      if (q.is_required && !Number.isFinite(n) && enforceRequired) throw new PsychometricScoringError("Missing scale value");
      if (Number.isFinite(n)) {
        if (n < Number(q.min_scale_value ?? 0) || n > Number(q.max_scale_value ?? 0)) throw new PsychometricScoringError("Scale value out of range");
        awarded = n * weight;
      }
    }
    if (q.question_type === "numeric") {
      if (q.is_required && !Number.isFinite(Number(a?.numeric_value)) && enforceRequired) throw new PsychometricScoringError("Numeric answer required");
      const numericMax = Number(questionScoringConfig.max_score ?? questionScoringConfig.max ?? 0);
      qMax = Number.isFinite(numericMax) && numericMax > 0 ? numericMax * weight : 0;
    }
    if (q.question_type === "text") {
      if (q.is_required && !String(a?.answer_text ?? "").trim() && enforceRequired) throw new PsychometricScoringError("Text answer required");
    }

    max += qMax;
    if (a?.id) awardedScoresByAnswerId[a.id] = awarded;
    const dim = String((q.metadata as Record<string, unknown> | null)?.dimension ?? "General");
    if (!dimension[dim]) dimension[dim] = { score: 0, maxScore: 0, percentage: 0 };
    dimension[dim].score += awarded;
    dimension[dim].maxScore += qMax;

    const selectedValues = Array.isArray(a?.selected_values) ? a?.selected_values : [];
    const selectedOptionTexts = qOpts.filter((o) => selectedValues.includes(o.id)).map((o) => o.option_text ?? "").filter(Boolean);
    snapshot.push({
      question_id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      option_id: a?.option_id ?? null,
      selected_values: selectedValues,
      selected_option_texts: selectedOptionTexts,
      numeric_value: a?.numeric_value ?? null,
      answer_text: a?.answer_text ?? null,
      awarded_score: awarded,
    });
  }

  Object.values(dimension).forEach((d) => {
    d.percentage = d.maxScore > 0 ? Number(((d.score / d.maxScore) * 100).toFixed(2)) : 0;
  });

  const total = answers.reduce((sum, answer) => sum + Number(awardedScoresByAnswerId[answer.id] ?? 0), 0);
  const percentageUnclamped = max > 0 ? (total / max) * 100 : 0;
  const percentage = Number(Math.min(100, Math.max(0, percentageUnclamped)).toFixed(2));
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentage, bands);
  const content = buildReportContent({ testTitle: test.title ?? "Psychometric Test", percentage, resultBand });

  return { max, total, percentage, resultBand, content, dimension, snapshot, awardedScoresByAnswerId };
}
