-- Ensure helper functions used by psychometric RLS are present.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
SECURITY DEFINER
SET search_path = public
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
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT role = 'admin'
      FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
REVOKE ALL ON FUNCTION public.current_profile_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_is_admin() TO authenticated;

ALTER TABLE public.psychometric_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychometric_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psychometric orders admin delete" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders admin update" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders user create own" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders user read own" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders student read own" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders student create own" ON public.psychometric_orders;
DROP POLICY IF EXISTS "psychometric orders student update own" ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_select_own_admin ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_insert_own_admin ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_update_own_admin ON public.psychometric_orders;
DROP POLICY IF EXISTS psychometric_orders_delete_admin ON public.psychometric_orders;

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

CREATE POLICY psychometric_orders_delete_admin
ON public.psychometric_orders
FOR DELETE
USING (
  public.current_profile_is_admin()
);

DROP POLICY IF EXISTS "test attempts create own" ON public.test_attempts;
DROP POLICY IF EXISTS "test attempts own" ON public.test_attempts;
DROP POLICY IF EXISTS "test attempts update own pending" ON public.test_attempts;
DROP POLICY IF EXISTS "test attempts student read own" ON public.test_attempts;
DROP POLICY IF EXISTS "test attempts student create own" ON public.test_attempts;
DROP POLICY IF EXISTS "test attempts student update own" ON public.test_attempts;
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

DROP POLICY IF EXISTS "psychometric reports student read own" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports student create own" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports student update own" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports admin delete" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports own" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports create own" ON public.psychometric_reports;
DROP POLICY IF EXISTS "psychometric reports update own" ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_select_own_admin ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_insert_own_admin ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_update_own_admin ON public.psychometric_reports;
DROP POLICY IF EXISTS psychometric_reports_delete_admin ON public.psychometric_reports;

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

CREATE POLICY psychometric_reports_delete_admin
ON public.psychometric_reports
FOR DELETE
USING (
  public.current_profile_is_admin()
);
