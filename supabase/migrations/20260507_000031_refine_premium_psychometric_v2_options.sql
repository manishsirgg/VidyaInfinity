-- Refine premium psychometric v2 option quality for method/problem/preference prompts.
-- Safe, idempotent update keyed by question metadata.seed_key.

DO $$
BEGIN
  CREATE TEMP TABLE tmp_option_refinements (
    seed_key text,
    sort_order int,
    option_text text,
    option_value text,
    score_value numeric
  ) ON COMMIT DROP;

  INSERT INTO tmp_option_refinements (seed_key, sort_order, option_text, option_value, score_value) VALUES
  -- Career Clarity v2
  ('career_q03',1,'Guidance from mentors/teachers','mentor_guidance',4),
  ('career_q03',2,'Researching course and role details','role_research',4),
  ('career_q03',3,'Speaking with professionals in the field','professional_conversations',4),
  ('career_q03',4,'Career aptitude/psychometric assessments','career_assessments',3),
  ('career_q03',5,'Salary and job market trends','market_trends',3),
  ('career_q03',6,'Family suggestions only','family_only',1),

  ('career_q08',1,'Internships or job shadowing exposure','internship_exposure',4),
  ('career_q08',2,'Career fairs and counseling sessions','career_fairs_counseling',4),
  ('career_q08',3,'Project work related to a career area','career_projects',4),
  ('career_q08',4,'Informational interviews with seniors/alumni','alumni_interviews',3),
  ('career_q08',5,'Watching random social media career content','random_social_content',1),
  ('career_q08',6,'No practical activity yet','no_activity_yet',1),

  ('career_q12',1,'Official college/university websites','official_websites',4),
  ('career_q12',2,'Government exam/career portals','govt_portals',4),
  ('career_q12',3,'Career counselors or school advisors','counselors_advisors',4),
  ('career_q12',4,'Seniors/alumni experiences','seniors_alumni',3),
  ('career_q12',5,'Unverified social media posts','unverified_social_posts',1),
  ('career_q12',6,'Friends'' opinions without checking facts','unchecked_friend_opinions',1),

  ('career_q15',1,'Confused between multiple career paths','multi_path_confusion',1),
  ('career_q15',2,'Clear goal but no action plan','goal_without_plan',2),
  ('career_q15',3,'Family pressure on career choice','family_pressure',1),
  ('career_q15',4,'Lack of reliable information','lack_of_information',2),
  ('career_q15',5,'Fear of making the wrong choice','fear_wrong_choice',1),
  ('career_q15',6,'Need expert guidance to decide','need_expert_guidance',3),

  ('career_q19',1,'Supportive parents/guardians','supportive_family',4),
  ('career_q19',2,'Teachers/mentors I can approach','teacher_mentor_support',4),
  ('career_q19',3,'Peer study or goal-tracking group','peer_support_group',3),
  ('career_q19',4,'Access to counseling/coaching resources','counseling_resources',4),
  ('career_q19',5,'Mostly self-managed with limited support','limited_support',2),
  ('career_q19',6,'No dependable support system currently','no_support_system',1),

  -- Learning Style v2
  ('learning_q03',1,'Reading notes/textbook actively','reading_notes',4),
  ('learning_q03',2,'Watching concept videos','watching_videos',3),
  ('learning_q03',3,'Solving practice questions','practice_questions',4),
  ('learning_q03',4,'Making concise summaries','making_summaries',4),
  ('learning_q03',5,'Teaching someone else','teaching_others',4),
  ('learning_q03',6,'Group discussion with focused peers','group_discussion',3),

  ('learning_q08',1,'Mobile phone/social media distractions','mobile_social_media',1),
  ('learning_q08',2,'Noise around me','noise_environment',1),
  ('learning_q08',3,'Lack of sleep/low energy','lack_of_sleep',1),
  ('learning_q08',4,'Overthinking/stress','overthinking_stress',1),
  ('learning_q08',5,'Too many tasks at once','task_overload',2),
  ('learning_q08',6,'No fixed study schedule','no_study_schedule',2),

  ('learning_q12',1,'Teacher explanations and doubt-solving','teacher_explanations',4),
  ('learning_q12',2,'Structured video lectures/courses','structured_video_courses',3),
  ('learning_q12',3,'Solved examples and PYQs','solved_examples_pyqs',4),
  ('learning_q12',4,'Short summary notes and cheat sheets','summary_notes',3),
  ('learning_q12',5,'Peer discussions with serious students','serious_peer_discussions',3),
  ('learning_q12',6,'Random internet browsing without a plan','random_browsing',1),

  ('learning_q15',1,'Analyze mistakes and rewrite weak topics','error_analysis',4),
  ('learning_q15',2,'Create a focused reattempt plan','reattempt_plan',4),
  ('learning_q15',3,'Ask teacher/mentor for targeted feedback','targeted_feedback',4),
  ('learning_q15',4,'Practice similar question sets','similar_practice_sets',4),
  ('learning_q15',5,'Take a break and restart with schedule','reset_with_schedule',3),
  ('learning_q15',6,'Avoid reviewing the test and move on','avoid_review',1),

  ('learning_q19',1,'Flashcards/revision cards','flashcards',4),
  ('learning_q19',2,'Formula sheets/one-page summaries','formula_sheets',4),
  ('learning_q19',3,'Timed mock tests','timed_mocks',4),
  ('learning_q19',4,'Spaced revision calendar','spaced_revision',4),
  ('learning_q19',5,'Mind maps/concept linking','mind_maps',3),
  ('learning_q19',6,'Last-night cramming only','last_night_cramming',1),

  -- Personality v2
  ('personality_q03',1,'I stay calm under pressure','calm_under_pressure',4),
  ('personality_q03',2,'I take responsibility quickly','take_responsibility',4),
  ('personality_q03',3,'I seek feedback to improve','seek_feedback',4),
  ('personality_q03',4,'I delay decisions','delay_decisions',1),
  ('personality_q03',5,'I avoid difficult conversations','avoid_difficult_conversations',1),
  ('personality_q03',6,'I struggle with consistency','struggle_consistency',1),

  ('personality_q08',1,'When people disagree with my ideas','disagreement_trigger',2),
  ('personality_q08',2,'When tasks pile up at the same time','task_pileup',1),
  ('personality_q08',3,'When plans change suddenly','sudden_change',2),
  ('personality_q08',4,'When I feel unheard in group work','feel_unheard',1),
  ('personality_q08',5,'When I am tired or sleep-deprived','fatigue_sleep_deprived',1),
  ('personality_q08',6,'When results are slower than expected','slow_results',2),

  ('personality_q12',1,'I review what went wrong without blaming','reflect_without_blame',4),
  ('personality_q12',2,'I ask for honest feedback and note actions','feedback_action_notes',4),
  ('personality_q12',3,'I adjust my process and test again','adjust_and_retest',4),
  ('personality_q12',4,'I discuss mistakes with a mentor','mentor_discussion',3),
  ('personality_q12',5,'I track recurring mistakes in a journal','mistake_journal',3),
  ('personality_q12',6,'I ignore mistakes to protect confidence','ignore_mistakes',1),

  ('personality_q15',1,'Listening fully before responding','active_listening',4),
  ('personality_q15',2,'Clarifying roles and deadlines early','role_clarity',4),
  ('personality_q15',3,'Giving constructive feedback respectfully','constructive_feedback',4),
  ('personality_q15',4,'Helping when teammates are stuck','support_teammates',3),
  ('personality_q15',5,'Taking ownership of my part consistently','ownership_consistency',4),
  ('personality_q15',6,'Avoiding conflict by staying silent always','silent_conflict_avoidance',1),

  ('personality_q19',1,'Supportive mentor/teacher check-ins','mentor_checkins',4),
  ('personality_q19',2,'Structured routine and sleep discipline','routine_sleep_discipline',4),
  ('personality_q19',3,'Exercise, breathing, or mindfulness habits','stress_regulation_habits',4),
  ('personality_q19',4,'Talking to trusted friends/family','trusted_people_talks',3),
  ('personality_q19',5,'Breaking problems into smaller actions','break_into_actions',4),
  ('personality_q19',6,'Keeping stress to myself and avoiding help','isolate_under_stress',1);

  WITH target_questions AS (
    SELECT pq.id AS question_id, (pq.metadata->>'seed_key') AS seed_key
    FROM public.psychometric_questions pq
    JOIN public.psychometric_tests pt ON pt.id = pq.test_id
    WHERE pt.slug IN (
      'career-clarity-direction-test-v2',
      'learning-style-study-strategy-test-v2',
      'personality-strengths-growth-profile-v2'
    )
      AND coalesce(pq.metadata->>'seed_key','') IN (SELECT DISTINCT seed_key FROM tmp_option_refinements)
  )
  UPDATE public.psychometric_question_options pqo
  SET option_text = r.option_text,
      option_value = r.option_value,
      score_value = r.score_value,
      sort_order = r.sort_order,
      is_active = true,
      metadata = coalesce(pqo.metadata, '{}'::jsonb)
        || jsonb_build_object('seed_key', r.seed_key || '_opt_' || r.sort_order, 'seed_prefix', 'premium_phase1_v2')
  FROM target_questions tq
  JOIN tmp_option_refinements r ON r.seed_key = tq.seed_key
  WHERE pqo.question_id = tq.question_id
    AND pqo.sort_order = r.sort_order;

  INSERT INTO public.psychometric_question_options (question_id, option_text, option_value, score_value, sort_order, is_active, metadata)
  SELECT tq.question_id, r.option_text, r.option_value, r.score_value, r.sort_order, true,
         jsonb_build_object('seed_key', r.seed_key || '_opt_' || r.sort_order, 'seed_prefix', 'premium_phase1_v2')
  FROM (
    SELECT pq.id AS question_id, (pq.metadata->>'seed_key') AS seed_key
    FROM public.psychometric_questions pq
    JOIN public.psychometric_tests pt ON pt.id = pq.test_id
    WHERE pt.slug IN (
      'career-clarity-direction-test-v2',
      'learning-style-study-strategy-test-v2',
      'personality-strengths-growth-profile-v2'
    )
      AND coalesce(pq.metadata->>'seed_key','') IN (SELECT DISTINCT seed_key FROM tmp_option_refinements)
  ) tq
  JOIN tmp_option_refinements r ON r.seed_key = tq.seed_key
  WHERE NOT EXISTS (
    SELECT 1 FROM public.psychometric_question_options pqo
    WHERE pqo.question_id = tq.question_id
      AND pqo.sort_order = r.sort_order
  );

  WITH target_questions AS (
    SELECT pq.id AS question_id, (pq.metadata->>'seed_key') AS seed_key
    FROM public.psychometric_questions pq
    JOIN public.psychometric_tests pt ON pt.id = pq.test_id
    WHERE pt.slug IN (
      'career-clarity-direction-test-v2',
      'learning-style-study-strategy-test-v2',
      'personality-strengths-growth-profile-v2'
    )
      AND coalesce(pq.metadata->>'seed_key','') IN (SELECT DISTINCT seed_key FROM tmp_option_refinements)
  )
  UPDATE public.psychometric_question_options pqo
  SET is_active = false
  FROM target_questions tq
  WHERE pqo.question_id = tq.question_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_option_refinements r
      WHERE r.seed_key = tq.seed_key
        AND r.sort_order = pqo.sort_order
    );
END $$;
