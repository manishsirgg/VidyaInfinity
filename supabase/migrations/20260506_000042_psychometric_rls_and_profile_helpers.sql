-- Ensure helper functions used by psychometric RLS are present.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.current_profile_role() = 'admin', false);
$$;

ALTER TABLE public.psychometric_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychometric_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psychometric_orders_select_own_admin ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_insert_own_admin ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_update_own_admin ON public.psychometric_orders;

CREATE POLICY psychometric_orders_select_own_admin
ON public.psychometric_orders
FOR SELECT
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);

CREATE POLICY psychometric_orders_insert_own_admin
ON public.psychometric_orders
FOR INSERT
WITH CHECK (
  (
    public.current_profile_role() = 'student'
    AND user_id = public.current_profile_id()
  )
  OR public.current_profile_is_admin()
);

CREATE POLICY psychometric_orders_update_own_admin
ON public.psychometric_orders
FOR UPDATE
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
)
WITH CHECK (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);

DROP POLICY IF EXISTS test_attempts_select_own_admin ON public.test_attempts;
DROP POLICY IF EXISTS test_attempts_insert_own_admin ON public.test_attempts;
DROP POLICY IF EXISTS test_attempts_update_own_admin ON public.test_attempts;

CREATE POLICY test_attempts_select_own_admin
ON public.test_attempts
FOR SELECT
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);

CREATE POLICY test_attempts_insert_own_admin
ON public.test_attempts
FOR INSERT
WITH CHECK (
  (
    public.current_profile_role() = 'student'
    AND user_id = public.current_profile_id()
  )
  OR public.current_profile_is_admin()
);

CREATE POLICY test_attempts_update_own_admin
ON public.test_attempts
FOR UPDATE
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
)
WITH CHECK (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);

DROP POLICY IF EXISTS psychometric_reports_select_own_admin ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_insert_own_admin ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_update_own_admin ON public.psychometric_reports;

CREATE POLICY psychometric_reports_select_own_admin
ON public.psychometric_reports
FOR SELECT
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);

CREATE POLICY psychometric_reports_insert_own_admin
ON public.psychometric_reports
FOR INSERT
WITH CHECK (
  (
    public.current_profile_role() = 'student'
    AND user_id = public.current_profile_id()
  )
  OR public.current_profile_is_admin()
);

CREATE POLICY psychometric_reports_update_own_admin
ON public.psychometric_reports
FOR UPDATE
USING (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
)
WITH CHECK (
  user_id = public.current_profile_id()
  OR public.current_profile_is_admin()
);
