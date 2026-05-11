-- Diagnostic: detect duplicate attempt rows per psychometric order before enforcing uniqueness.
DO $$
DECLARE
  dup_count bigint;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT order_id
    FROM public.test_attempts
    WHERE order_id IS NOT NULL
    GROUP BY order_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Cannot create unique index on test_attempts(order_id): found %s duplicate order_id groups', dup_count),
      HINT = 'Deduplicate public.test_attempts rows (keeping one row per order_id) and re-run this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_unique_order_id_not_null
  ON public.test_attempts(order_id)
  WHERE order_id IS NOT NULL;
