-- Keep legacy approval_status columns aligned with operational status so
-- checkout eligibility and listing visibility remain consistent.

update public.courses
set approval_status = status
where coalesce(status, '') in ('approved', 'pending', 'rejected')
  and coalesce(approval_status, '') <> status;

update public.institutes
set approval_status = status
where coalesce(status, '') in ('approved', 'pending', 'rejected')
  and coalesce(approval_status, '') <> status;
