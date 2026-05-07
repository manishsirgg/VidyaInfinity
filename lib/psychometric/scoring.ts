import { buildReportContent, pickResultBand } from "@/lib/psychometric/reporting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type OptionRow = { id: string; question_id: string; option_text?: string | null; score_value: number | null; metadata: Record<string, unknown> | null };
type AnswerRow = { id: string; question_id: string; option_id: string | null; selected_values: string[] | null; numeric_value: number | null; answer_text: string | null; awarded_score: number | string | null };
type QuestionRow = { id: string; question_text: string; question_type: string; is_required: boolean; weight: number | null; min_scale_value: number | null; max_scale_value: number | null; metadata: Record<string, unknown> | null; scoring_config: Record<string, unknown> | null };
type TestRow = { title: string | null; scoring_config: Record<string, unknown> | null };

export class PsychometricScoringError extends Error {}

const round2 = (value: number) => Number(value.toFixed(2));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export async function computePsychometricReportData(params: {
  test: TestRow;
  answers: AnswerRow[];
  enforceRequired: boolean;
}) {
  const { test, answers, enforceRequired } = params;
  const testId = String((test as { id?: string | null }).id ?? "unknown");
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new PsychometricScoringError(admin.error);

  const { data: activeQuestions, error: questionsError } = await admin.data
    .from("psychometric_questions")
    .select("id,question_text,question_type,is_required,weight,min_scale_value,max_scale_value,metadata,scoring_config")
    .eq("test_id", testId)
    .eq("is_active", true)
    .order("sort_order");
  if (questionsError) throw new PsychometricScoringError(questionsError.message);

  const questions = (activeQuestions ?? []) as QuestionRow[];
  const activeQuestionIds = questions.map((q) => q.id);
  const options: OptionRow[] = [];
  if (activeQuestionIds.length > 0) {
    const { data: activeOptions, error: optionsError } = await admin.data
      .from("psychometric_question_options")
      .select("id,question_id,score_value,option_text,is_active,metadata")
      .in("question_id", activeQuestionIds)
      .eq("is_active", true)
      .order("sort_order");
    if (optionsError) throw new PsychometricScoringError(optionsError.message);
    options.push(...((activeOptions ?? []) as OptionRow[]));
  }
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const optionMap = new Map(options.map((o) => [o.id, o.option_text ?? null]));
  const optsByQ = new Map<string, OptionRow[]>();
  options.forEach((o) => optsByQ.set(o.question_id, [...(optsByQ.get(o.question_id) ?? []), o]));
  const ansByQ = new Map(answers.map((a) => [a.question_id, a]));

  let max = 0;
  const dimension: Record<string, { score: number; maxScore: number; percentage: number }> = {};
  const awardedScoresByAnswerId: Record<string, number> = {};
  const maxScoreByQuestion: Array<{ questionId: string; questionType: string; qMax: number }> = [];

  const validWeight = (value: unknown) => {
    const n = Number(value ?? 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const validNumber = (value: unknown, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  for (const q of questions) {
    const a = ansByQ.get(q.id);
    const qOpts = optsByQ.get(q.id) ?? [];
    const weight = validWeight(q.weight);
    if (q.is_required && !a && enforceRequired) {
      throw new PsychometricScoringError(`Required question unanswered: ${q.question_text}`);
    }

    let awarded = 0;
    let qMax = 0;
    const questionScoringConfig = (q.scoring_config as Record<string, unknown> | null) ?? {};
    if (q.question_type === "single_choice") {
      const optionScores = qOpts.map((o) => validNumber(o.score_value, 0)).filter((v) => Number.isFinite(v));
      qMax = (optionScores.length > 0 ? Math.max(0, ...optionScores) : 0) * weight;
      if (q.is_required && !a?.option_id && enforceRequired) throw new PsychometricScoringError("Single choice answer required");
      if (a?.option_id) {
        const op = qOpts.find((o) => o.id === a.option_id);
        if (!op && q.is_required && enforceRequired) throw new PsychometricScoringError("Invalid single choice answer");
        awarded = validNumber(op?.score_value, 0) * weight;
      }
    }
    if (q.question_type === "multiple_choice") {
      qMax = qOpts
        .map((o) => validNumber(o.score_value, 0))
        .filter((v) => Number.isFinite(v) && v > 0)
        .reduce((s, v) => s + v, 0) * weight;
      const vals = Array.isArray(a?.selected_values) ? a.selected_values : [];
      if (q.is_required && vals.length === 0 && enforceRequired) throw new PsychometricScoringError("At least one option must be selected");
      const selected = qOpts.filter((o) => vals.includes(o.id));
      if (q.is_required && selected.length !== vals.length && enforceRequired) throw new PsychometricScoringError("Invalid multi choice answer");
      awarded = selected.reduce((s, o) => s + validNumber(o.score_value, 0), 0) * weight;
    }
    if (q.question_type === "scale") {
      const configuredScaleMax = validNumber(questionScoringConfig.max_scale_value ?? questionScoringConfig.max ?? q.max_scale_value, 0);
      const validScaleMax = configuredScaleMax > 0 ? configuredScaleMax : 10;
      qMax = validScaleMax * weight;
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
    maxScoreByQuestion.push({ questionId: q.id, questionType: q.question_type, qMax: round2(qMax) });
    if (a?.id) awardedScoresByAnswerId[a.id] = awarded;
    const dim = String((q.metadata as Record<string, unknown> | null)?.dimension ?? "General");
    if (!dimension[dim]) dimension[dim] = { score: 0, maxScore: 0, percentage: 0 };
    dimension[dim].score += awarded;
    dimension[dim].maxScore += qMax;

  }

  const normalizeSelectedValues = (selectedValues: unknown): string[] => {
    if (Array.isArray(selectedValues)) return selectedValues.filter((value): value is string => typeof value === "string");
    if (typeof selectedValues === "string") {
      try {
        const parsed = JSON.parse(selectedValues);
        if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string");
      } catch {
        return [];
      }
    }
    return [];
  };

  const answersSnapshot = answers.map((answer) => {
    const question = questionMap.get(answer.question_id);
    const normalizedSelectedValues = normalizeSelectedValues(answer.selected_values);
    return {
      question_id: answer.question_id,
      question_text: question?.question_text ?? "Question not available",
      question_type: question?.question_type ?? "unknown",
      option_id: answer.option_id ?? null,
      selected_values: normalizedSelectedValues,
      selected_option_text: answer.option_id ? optionMap.get(answer.option_id) ?? null : null,
      selected_option_texts: normalizedSelectedValues.map((id) => optionMap.get(id)).filter((value): value is string => Boolean(value)),
      numeric_value: answer.numeric_value ?? null,
      answer_text: answer.answer_text ?? null,
      awarded_score: Number(answer.awarded_score ?? 0),
    };
  });

  console.log("[psychometric-snapshot-built]", {
    answersCount: answers.length,
    questionsCount: questions.length,
    optionsCount: options.length,
    answersSnapshotLength: answersSnapshot.length,
    firstAnswer: answers[0]
      ? {
          question_id: answers[0].question_id,
          option_id: answers[0].option_id,
          selected_values: answers[0].selected_values,
        }
      : null,
    firstSnapshot: answersSnapshot[0] ?? null,
  });

  Object.values(dimension).forEach((d) => {
    d.percentage = d.maxScore > 0 ? Number(((d.score / d.maxScore) * 100).toFixed(2)) : 0;
  });

  const totalScore = round2(answers.reduce((sum, answer) => sum + Number(answer.awarded_score ?? 0), 0));
  const maxScore = round2(max);
  const percentageUnclamped = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  const percentageScore = round2(clamp(percentageUnclamped, 0, 100));

  const maxByType = questions.reduce<Record<string, number>>((acc, q) => {
    const found = maxScoreByQuestion.find((row) => row.questionId === q.id);
    acc[q.question_type] = round2((acc[q.question_type] ?? 0) + (found?.qMax ?? 0));
    return acc;
  }, {});

  console.log("[psychometric-max-score-debug]", {
    testId,
    activeQuestionCount: questions.length,
    activeOptionCount: options.length,
    maxByQuestion: maxScoreByQuestion,
    maxByType,
    finalMaxScore: maxScore,
  });

  console.log("[psychometric-scoring-final-debug]", {
    answersCount: answers.length,
    firstAnswerRaw: answers[0] ?? null,
    totalScore,
    activeQuestionCount: questions.length,
    activeOptionCount: options.length,
    maxScore,
    percentageScore,
    snapshotLength: answersSnapshot.length,
  });

  if (questions.length > 0 && maxScore <= 0 && totalScore > 0) {
    console.error("[psychometric-scoring] max score calculation failed", { testId, totalScore, finalMaxScore: maxScore, maxScoreByQuestion });
    throw new PsychometricScoringError("Report max score could not be calculated.");
  }
  const scoringConfig = test.scoring_config as { bands?: { min: number; max: number; label: string }[] } | null;
  const bands = Array.isArray(scoringConfig?.bands) ? scoringConfig?.bands : undefined;
  const resultBand = pickResultBand(percentageScore, bands);
  const content = buildReportContent({ testTitle: test.title ?? "Psychometric Test", percentage: percentageScore, resultBand });

  return {
    totalScore,
    maxScore,
    percentageScore,
    answersSnapshot,
    resultBand,
    content,
    dimension,
    awardedScoresByAnswerId,
  };
}
