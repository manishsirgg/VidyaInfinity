-- Psychometric vertical slice parity (safe/idempotent)
DO $$ BEGIN
  ALTER TYPE public.order_kind ADD VALUE IF NOT EXISTS 'psychometric_test';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ DECLARE v text; BEGIN
  FOREACH v IN ARRAY ARRAY['single_choice','multiple_choice','scale','text','numeric'] LOOP
    BEGIN
      ALTER TYPE public.psychometric_question_type ADD VALUE IF NOT EXISTS v;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.psychometric_tests(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.psychometric_orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_started',
  started_at timestamptz NULL,
  submitted_at timestamptz NULL,
  completed_at timestamptz NULL,
  expires_at timestamptz NULL,
  total_score numeric(12,2) NOT NULL DEFAULT 0,
  max_score numeric(12,2) NOT NULL DEFAULT 0,
  percentage_score numeric(8,2) NOT NULL DEFAULT 0,
  result_band text NULL,
  report_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS order_id uuid NULL REFERENCES public.psychometric_orders(id) ON DELETE SET NULL;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_started';
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS total_score numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS max_score numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS percentage_score numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS result_band text NULL;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS report_id uuid NULL;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.test_attempts
    ADD CONSTRAINT test_attempts_status_check CHECK (status IN ('not_started','in_progress','submitted','completed','expired','cancelled','unlocked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_test_attempts_user_id ON public.test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_test_id ON public.test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_order_id ON public.test_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_status ON public.test_attempts(status);
CREATE INDEX IF NOT EXISTS idx_test_attempts_created_at_desc ON public.test_attempts(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_one_active_per_order ON public.test_attempts(order_id) WHERE order_id IS NOT NULL AND status IN ('not_started','in_progress','submitted','unlocked');

CREATE TABLE IF NOT EXISTS public.psychometric_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.psychometric_tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.psychometric_orders(id) ON DELETE SET NULL,
  total_score numeric(12,2) NOT NULL DEFAULT 0,
  max_score numeric(12,2) NOT NULL DEFAULT 0,
  percentage_score numeric(8,2) NOT NULL DEFAULT 0,
  result_band text NULL,
  summary text NULL,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvement_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  dimension_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_html text NULL,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_url text NULL,
  email_sent_at timestamptz NULL,
  whatsapp_sent_at timestamptz NULL,
  delivery_status text NOT NULL DEFAULT 'not_sent',
  delivery_error text NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psychometric_reports_user_id ON public.psychometric_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_psychometric_reports_test_id ON public.psychometric_reports(test_id);
CREATE INDEX IF NOT EXISTS idx_psychometric_reports_order_id ON public.psychometric_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_psychometric_reports_created_at_desc ON public.psychometric_reports(created_at DESC);

ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS slug text NULL;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS category text NULL;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS duration_minutes integer NULL;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS instructions text NULL;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS report_template jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.psychometric_tests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS psychometric_tests_slug_unique_idx ON public.psychometric_tests(slug) WHERE slug IS NOT NULL;
