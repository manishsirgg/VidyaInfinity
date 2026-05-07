create unique index if not exists psychometric_answers_attempt_question_unique_idx
on public.psychometric_answers (attempt_id, question_id);
