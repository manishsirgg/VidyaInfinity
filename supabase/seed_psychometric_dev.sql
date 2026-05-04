-- DEV-ONLY seed data for psychometric testing.
-- Run manually in local/dev environments. Do NOT run in production.

DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); q3 uuid := gen_random_uuid(); q4 uuid := gen_random_uuid(); q5 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.psychometric_tests (id,title,slug,description,price,is_active,scoring_config,instructions)
  VALUES (
    v_test_id,
    'Career Orientation Baseline',
    'career-orientation-baseline',
    'Sample psychometric test for local QA only.',
    199,
    true,
    '{"bands":[{"label":"Low","min":0,"max":40},{"label":"Moderate","min":41,"max":70},{"label":"High","min":71,"max":100}]}'::jsonb,
    'Answer honestly. This seeded test is for QA only.'
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_test_id FROM public.psychometric_tests WHERE slug='career-orientation-baseline';

  INSERT INTO public.psychometric_questions (id,test_id,question_text,question_type,is_required,sort_order,min_scale_value,max_scale_value,is_active) VALUES
  (q1,v_test_id,'I enjoy solving structured problems.','single_choice',true,1,null,null,true),
  (q2,v_test_id,'Select strengths you identify with.','multiple_choice',true,2,null,null,true),
  (q3,v_test_id,'Rate your comfort with uncertainty.','scale',true,3,1,10,true),
  (q4,v_test_id,'How many hours per week can you dedicate to skill-building?','numeric',true,4,null,null,true),
  (q5,v_test_id,'Describe your ideal work environment.','text',false,5,null,null,true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.psychometric_question_options (question_id,option_label,option_value,score_value,sort_order,is_active) VALUES
  (q1,'Strongly agree','strongly_agree',5,1,true),(q1,'Agree','agree',4,2,true),(q1,'Neutral','neutral',3,3,true),(q1,'Disagree','disagree',2,4,true),(q1,'Strongly disagree','strongly_disagree',1,5,true),
  (q2,'Analytical thinking','analytical',4,1,true),(q2,'Creativity','creative',4,2,true),(q2,'Empathy','empathy',4,3,true),(q2,'Execution discipline','execution',4,4,true)
  ON CONFLICT DO NOTHING;
END $$;
