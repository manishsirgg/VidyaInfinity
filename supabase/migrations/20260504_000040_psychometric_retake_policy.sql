-- Allow paid psychometric retakes by removing one-paid-per-test restriction.
DROP INDEX IF EXISTS public.psychometric_orders_one_paid_per_user_test_idx;
