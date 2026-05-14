-- Repeat course enrollment after access expiry is allowed.
-- Duplicate active purchase is enforced by active enrollment/access checks, not permanent paid-order uniqueness.
DROP INDEX IF EXISTS public.idx_course_orders_one_paid_per_student_course;
