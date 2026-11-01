-- Enforce one active course title per institute at the database layer.
-- This closes the race window between the API duplicate-check SELECT and INSERT.
-- Existing duplicate titles must be resolved before applying this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.courses
    WHERE is_deleted = false
    GROUP BY institute_id, lower(btrim(title))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Active duplicate course titles exist. Resolve them before applying the unique index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS courses_active_institute_normalized_title_uidx
ON public.courses (institute_id, lower(btrim(title)))
WHERE is_deleted = false;
