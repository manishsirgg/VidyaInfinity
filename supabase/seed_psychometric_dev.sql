-- DEV-ONLY seed data for psychometric testing.
-- Run manually in local/dev environments. Do NOT run in production.
-- This script is intentionally NOT part of production migrations.

DO $$
DECLARE
  v_slug text := 'career-orientation-baseline';
  v_test_id uuid;
BEGIN
  -- Use existing test by slug if it exists; otherwise create it.
  SELECT id INTO v_test_id
  FROM public.psychometric_tests
  WHERE slug = v_slug
  LIMIT 1;

  IF v_test_id IS NULL THEN
    v_test_id := gen_random_uuid();

    INSERT INTO public.psychometric_tests (
      id,
      title,
      slug,
      description,
      price,
      is_active,
      scoring_config,
      instructions
    )
    VALUES (
      v_test_id,
      'Career Orientation Baseline',
      v_slug,
      'Sample psychometric test for local QA only.',
      199,
      true,
      '{"bands":[{"label":"Low","min":0,"max":40},{"label":"Moderate","min":41,"max":70},{"label":"High","min":71,"max":100}]}'::jsonb,
      'Answer honestly. This seeded test is for QA only.'
    );
  ELSE
    UPDATE public.psychometric_tests
    SET
      title = 'Career Orientation Baseline',
      description = 'Sample psychometric test for local QA only.',
      price = 199,
      is_active = true,
      scoring_config = '{"bands":[{"label":"Low","min":0,"max":40},{"label":"Moderate","min":41,"max":70},{"label":"High","min":71,"max":100}]}'::jsonb,
      instructions = 'Answer honestly. This seeded test is for QA only.'
    WHERE id = v_test_id;
  END IF;

  -- Idempotent dev reset: remove only this seeded test's options/questions, then recreate.
  DELETE FROM public.psychometric_question_options
  WHERE question_id IN (
    SELECT id
    FROM public.psychometric_questions
    WHERE test_id = v_test_id
  );

  DELETE FROM public.psychometric_questions
  WHERE test_id = v_test_id;

  -- Recreate seeded questions/options for deterministic QA data.
  WITH inserted_questions AS (
    INSERT INTO public.psychometric_questions (
      id,
      test_id,
      question_text,
      question_type,
      is_required,
      sort_order,
      min_scale_value,
      max_scale_value,
      is_active
    )
    VALUES
      (gen_random_uuid(), v_test_id, 'I enjoy solving structured problems.', 'single_choice', true, 1, null, null, true),
      (gen_random_uuid(), v_test_id, 'Select strengths you identify with.', 'multiple_choice', true, 2, null, null, true),
      (gen_random_uuid(), v_test_id, 'Rate your comfort with uncertainty.', 'scale', true, 3, 1, 10, true),
      (gen_random_uuid(), v_test_id, 'How many hours per week can you dedicate to skill-building?', 'numeric', true, 4, null, null, true),
      (gen_random_uuid(), v_test_id, 'Describe your ideal work environment.', 'text', false, 5, null, null, true)
    RETURNING id, sort_order
  )
  INSERT INTO public.psychometric_question_options (
    question_id,
    option_text,
    option_value,
    score_value,
    sort_order,
    is_active
  )
  SELECT
    iq.id,
    option_data.option_text,
    option_data.option_value,
    option_data.score_value,
    option_data.sort_order,
    true
  FROM inserted_questions iq
  JOIN (
    VALUES
      (1, 'Strongly agree', 'strongly_agree', 5, 1),
      (1, 'Agree', 'agree', 4, 2),
      (1, 'Neutral', 'neutral', 3, 3),
      (1, 'Disagree', 'disagree', 2, 4),
      (1, 'Strongly disagree', 'strongly_disagree', 1, 5),
      (2, 'Analytical thinking', 'analytical', 4, 1),
      (2, 'Creativity', 'creative', 4, 2),
      (2, 'Empathy', 'empathy', 4, 3),
      (2, 'Execution discipline', 'execution', 4, 4)
  ) AS option_data(question_sort_order, option_text, option_value, score_value, sort_order)
    ON option_data.question_sort_order = iq.sort_order;
END $$;
