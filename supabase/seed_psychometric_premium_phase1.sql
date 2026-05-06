-- Production-safe idempotent seed for premium psychometric phase 1 catalog.
-- Run manually in staging first, then production after admin review.

DO $$
DECLARE
  v_seed_prefix text := 'premium_phase1_v1';
  v_disclaimer text := 'This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.';
BEGIN
  CREATE TEMP TABLE tmp_tests (
    slug text primary key,
    title text,
    category text,
    description text,
    price numeric,
    duration_minutes int,
    instructions text,
    scoring_config jsonb,
    metadata jsonb
  ) ON COMMIT DROP;

  INSERT INTO tmp_tests VALUES
  ('career-clarity-direction-test','Career Clarity & Direction Test','career_guidance','A structured guidance assessment to help students identify career direction, readiness patterns, and next-step priorities.',499,35,'Answer honestly based on your current situation. There are no right or wrong answers.',jsonb_build_object('bands',jsonb_build_array(jsonb_build_object('label','Needs Career Clarity','min_percent',0,'max_percent',24),jsonb_build_object('label','Developing Career Awareness','min_percent',25,'max_percent',49),jsonb_build_object('label','Strong Career Readiness','min_percent',50,'max_percent',74),jsonb_build_object('label','Excellent Career Alignment','min_percent',75,'max_percent',100)),'report_templates',jsonb_build_object('summary','Your current career direction score places you in {{band_label}}. Use this report to identify clear next actions.','strengths','You are showing promising signs in {{top_dimensions}}.','improvement_areas','The biggest growth opportunities are in {{growth_dimensions}}.','recommendations','Prioritise goal-setting, mentorship, and weekly action tracking.','disclaimer',v_disclaimer)),jsonb_build_object('dimensions',jsonb_build_array('self_awareness','career_exposure','decision_readiness','action_discipline'),'report_template_version','phase1_v1','seed_key',v_seed_prefix||'_career')),
  ('learning-style-study-strategy-test','Learning Style & Study Strategy Test','study_skills','A practical assessment that helps students understand how they learn best and how to improve study strategies.',299,30,'Think about your regular school, coaching, or college study habits while answering.',jsonb_build_object('bands',jsonb_build_array(jsonb_build_object('label','Needs Study Foundation','min_percent',0,'max_percent',24),jsonb_build_object('label','Developing Study Awareness','min_percent',25,'max_percent',49),jsonb_build_object('label','Strong Study Readiness','min_percent',50,'max_percent',74),jsonb_build_object('label','Excellent Study Alignment','min_percent',75,'max_percent',100)),'report_templates',jsonb_build_object('summary','Your study strategy profile is {{band_label}}. This reflects how effectively your methods match your goals.','strengths','Your strongest habits are visible in {{top_dimensions}}.','improvement_areas','Your improvement areas are {{growth_dimensions}}.','recommendations','Use active recall, weekly planning, and feedback loops for steady progress.','disclaimer',v_disclaimer)),jsonb_build_object('dimensions',jsonb_build_array('learning_preference','attention_management','study_planning','revision_execution'),'report_template_version','phase1_v1','seed_key',v_seed_prefix||'_learning')),
  ('personality-strengths-growth-profile','Personality Strengths & Growth Profile','personal_development','A student development profile focused on strengths, social behaviour, resilience, and growth orientation.',399,35,'Respond based on your natural behaviour in academics, projects, and peer interactions.',jsonb_build_object('bands',jsonb_build_array(jsonb_build_object('label','Needs Growth Foundation','min_percent',0,'max_percent',24),jsonb_build_object('label','Developing Personal Awareness','min_percent',25,'max_percent',49),jsonb_build_object('label','Strong Personal Readiness','min_percent',50,'max_percent',74),jsonb_build_object('label','Excellent Strength Alignment','min_percent',75,'max_percent',100)),'report_templates',jsonb_build_object('summary','Your strengths profile is {{band_label}} and highlights how you approach opportunities and challenges.','strengths','Your leading strengths are in {{top_dimensions}}.','improvement_areas','Further growth is possible in {{growth_dimensions}}.','recommendations','Build routines for self-reflection, communication practice, and resilient goal pursuit.','disclaimer',v_disclaimer)),jsonb_build_object('dimensions',jsonb_build_array('self_regulation','collaboration','problem_solving','growth_mindset'),'report_template_version','phase1_v1','seed_key',v_seed_prefix||'_personality'));

  INSERT INTO public.psychometric_tests (id,title,slug,category,description,price,duration_minutes,instructions,is_active,scoring_config,metadata)
  SELECT gen_random_uuid(), t.title,t.slug,t.category,t.description,t.price,t.duration_minutes,t.instructions,false,t.scoring_config,t.metadata
  FROM tmp_tests t
  WHERE NOT EXISTS (SELECT 1 FROM public.psychometric_tests pt WHERE pt.slug=t.slug);

  UPDATE public.psychometric_tests pt
  SET title=t.title,category=t.category,description=t.description,price=t.price,duration_minutes=t.duration_minutes,instructions=t.instructions,is_active=false,scoring_config=t.scoring_config,metadata=coalesce(pt.metadata,'{}'::jsonb)||t.metadata,updated_at=now()
  FROM tmp_tests t
  WHERE pt.slug=t.slug;

  CREATE TEMP TABLE tmp_questions (
    test_slug text, seed_key text, question_text text, question_type text, is_required boolean, sort_order int, weight numeric, min_scale int, max_scale int, metadata jsonb
  ) ON COMMIT DROP;

  INSERT INTO tmp_questions
  SELECT test_slug, seed_key, question_text, question_type, is_required, sort_order, weight, min_scale, max_scale, metadata
  FROM (VALUES
  ('career-clarity-direction-test','career_q01','I can clearly explain why I am considering my preferred career path.','single_choice',true,1,1,null,null,'{"dimension":"self_awareness"}'::jsonb),
  ('career-clarity-direction-test','career_q02','I have explored at least three career options in detail.','single_choice',true,2,1,null,null,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q03','Which inputs do you actively use while choosing a career?','multiple_choice',true,3,1,null,null,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q04','How confident are you in your current career direction?','scale',true,4,1,1,10,'{"dimension":"self_awareness"}'::jsonb),
  ('career-clarity-direction-test','career_q05','How many hours per week do you spend on career exploration?','numeric',true,5,1,null,null,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q06','I understand the entrance requirements for my top career choice.','single_choice',true,6,1,null,null,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q07','I regularly set and review monthly academic/career goals.','single_choice',true,7,1,null,null,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q08','Which activities have helped you evaluate careers?','multiple_choice',true,8,1,null,null,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q09','Rate your ability to take decisions even when options feel uncertain.','scale',true,9,1,1,10,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q10','I seek guidance from mentors, teachers, or counselors before major decisions.','single_choice',true,10,1,null,null,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q11','I can connect my strengths with suitable career roles.','single_choice',true,11,1,null,null,'{"dimension":"self_awareness"}'::jsonb),
  ('career-clarity-direction-test','career_q12','What resources do you use for career information?','multiple_choice',true,12,1,null,null,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q13','Rate how consistently you follow through on planned actions.','scale',true,13,1,1,10,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q14','I can compare career options based on long-term fit, not only trends.','single_choice',true,14,1,null,null,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q15','Which challenges affect your career planning most?','multiple_choice',true,15,1,null,null,'{"dimension":"self_awareness"}'::jsonb),
  ('career-clarity-direction-test','career_q16','I take initiative to build skills aligned with my target career.','single_choice',true,16,1,null,null,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q17','How prepared do you feel for your next 12-month career plan?','scale',true,17,1,1,10,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q18','I understand how financial factors may influence my education pathway.','single_choice',true,18,1,null,null,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q19','Which support systems are currently available to you?','multiple_choice',true,19,1,null,null,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q20','I reflect on feedback and adapt my career strategy accordingly.','single_choice',true,20,1,null,null,'{"dimension":"self_awareness"}'::jsonb),
  ('career-clarity-direction-test','career_q21','Rate your awareness of future opportunities in your chosen field.','scale',true,21,1,1,10,'{"dimension":"career_exposure"}'::jsonb),
  ('career-clarity-direction-test','career_q22','I maintain a practical backup plan for my career journey.','single_choice',true,22,1,null,null,'{"dimension":"decision_readiness"}'::jsonb),
  ('career-clarity-direction-test','career_q23','What immediate action will you take this month?','text',false,23,1,null,null,'{"dimension":"action_discipline"}'::jsonb),
  ('career-clarity-direction-test','career_q24','I feel motivated and responsible for shaping my career direction.','single_choice',true,24,1,null,null,'{"dimension":"self_awareness"}'::jsonb)
  ) s(test_slug,seed_key,question_text,question_type,is_required,sort_order,weight,min_scale,max_scale,metadata);

  INSERT INTO tmp_questions SELECT replace(test_slug,'career-clarity-direction-test','learning-style-study-strategy-test'),replace(seed_key,'career_','learning_'),replace(question_text,'career','study'),question_type,is_required,sort_order,weight,min_scale,max_scale,jsonb_set(metadata,'{dimension}',to_jsonb((ARRAY['learning_preference','attention_management','study_planning','revision_execution'])[((sort_order-1)%4)+1])) FROM tmp_questions WHERE test_slug='career-clarity-direction-test';
  INSERT INTO tmp_questions SELECT replace(test_slug,'career-clarity-direction-test','personality-strengths-growth-profile'),replace(seed_key,'career_','personality_'),regexp_replace(replace(question_text,'career','personal growth'),'study','personal growth','gi'),question_type,is_required,sort_order,weight,min_scale,max_scale,jsonb_set(metadata,'{dimension}',to_jsonb((ARRAY['self_regulation','collaboration','problem_solving','growth_mindset'])[((sort_order-1)%4)+1])) FROM tmp_questions WHERE test_slug='career-clarity-direction-test';

  INSERT INTO public.psychometric_questions (id,test_id,question_text,question_type,is_required,sort_order,weight,min_scale_value,max_scale_value,is_active,metadata)
  SELECT gen_random_uuid(), pt.id,q.question_text,q.question_type::public.psychometric_question_type,q.is_required,q.sort_order,q.weight,q.min_scale,q.max_scale,true,coalesce(q.metadata,'{}'::jsonb)||jsonb_build_object('seed_key',q.seed_key,'seed_prefix',v_seed_prefix)
  FROM tmp_questions q JOIN public.psychometric_tests pt ON pt.slug=q.test_slug
  WHERE NOT EXISTS (
    SELECT 1 FROM public.psychometric_questions pq WHERE pq.test_id=pt.id AND coalesce(pq.metadata->>'seed_key','')=q.seed_key
  );

  UPDATE public.psychometric_questions pq
  SET question_text=q.question_text,question_type=q.question_type::public.psychometric_question_type,is_required=q.is_required,sort_order=q.sort_order,weight=q.weight,min_scale_value=q.min_scale,max_scale_value=q.max_scale,is_active=true,metadata=coalesce(pq.metadata,'{}'::jsonb)||coalesce(q.metadata,'{}'::jsonb)||jsonb_build_object('seed_key',q.seed_key,'seed_prefix',v_seed_prefix)
  FROM tmp_questions q JOIN public.psychometric_tests pt ON pt.slug=q.test_slug
  WHERE pq.test_id=pt.id AND coalesce(pq.metadata->>'seed_key','')=q.seed_key;

  INSERT INTO public.psychometric_question_options (question_id,option_text,option_value,score_value,sort_order,is_active,metadata)
  SELECT pq.id,o.option_text,o.option_value,o.score_value,o.sort_order,true,jsonb_build_object('seed_key',q.seed_key||'_opt_'||o.sort_order,'seed_prefix',v_seed_prefix)
  FROM tmp_questions q
  JOIN public.psychometric_tests pt ON pt.slug=q.test_slug
  JOIN public.psychometric_questions pq ON pq.test_id=pt.id AND coalesce(pq.metadata->>'seed_key','')=q.seed_key
  JOIN LATERAL (
    SELECT * FROM (VALUES
      ('Strongly agree','strongly_agree',4,1),('Agree','agree',3,2),('Neutral','neutral',2,3),('Disagree','disagree',1,4)
    ) a(option_text,option_value,score_value,sort_order)
    WHERE q.question_type='single_choice'
    UNION ALL
    SELECT * FROM (VALUES
      ('Very relevant to me','very_relevant',4,1),('Somewhat relevant','somewhat_relevant',3,2),('Not sure yet','not_sure',2,3),('Not relevant','not_relevant',1,4)
    ) b(option_text,option_value,score_value,sort_order)
    WHERE q.question_type='multiple_choice'
  ) o ON true
  WHERE q.question_type IN ('single_choice','multiple_choice')
    AND NOT EXISTS (
      SELECT 1 FROM public.psychometric_question_options pqo
      WHERE pqo.question_id=pq.id AND coalesce(pqo.metadata->>'seed_key','')=q.seed_key||'_opt_'||o.sort_order
    );
END $$;
