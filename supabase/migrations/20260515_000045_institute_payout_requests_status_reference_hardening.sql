-- Hardening: enforce payout request settlement/failure metadata consistency.
-- Safe/idempotent, additive only, no data deletion/renames.

DO $$
BEGIN
  IF to_regclass('public.institute_payout_requests') IS NULL THEN
    RAISE NOTICE 'public.institute_payout_requests not found; skipping hardening constraints.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institute_payout_requests'
      AND column_name = 'status'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institute_payout_requests'
      AND column_name = 'payment_reference'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.institute_payout_requests'::regclass
      AND conname = 'institute_payout_requests_paid_requires_payment_reference_chk'
  ) THEN
    ALTER TABLE public.institute_payout_requests
      ADD CONSTRAINT institute_payout_requests_paid_requires_payment_reference_chk
      CHECK (
        status <> 'paid'
        OR nullif(btrim(payment_reference), '') IS NOT NULL
      )
      NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institute_payout_requests'
      AND column_name = 'status'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institute_payout_requests'
      AND column_name = 'failure_reason'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.institute_payout_requests'::regclass
      AND conname = 'institute_payout_requests_failed_requires_failure_reason_chk'
  ) THEN
    ALTER TABLE public.institute_payout_requests
      ADD CONSTRAINT institute_payout_requests_failed_requires_failure_reason_chk
      CHECK (
        status <> 'failed'
        OR nullif(btrim(failure_reason), '') IS NOT NULL
      )
      NOT VALID;
  END IF;
END;
$$;
