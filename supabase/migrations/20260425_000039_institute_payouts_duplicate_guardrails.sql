-- Financial integrity hardening: duplicate guardrails for institute payout ledger.
-- Safe rollout plan:
--   1) Run diagnostics below and ensure result sets are empty or understood.
--   2) Apply indexes concurrently in production maintenance window if required.
-- Rollback note:
--   drop index if exists public.institute_payouts_source_reference_unique_idx;
--   drop index if exists public.institute_payouts_refund_reference_order_unique_idx;

-- Diagnostic query: duplicate source references.
-- select source_reference_type, source_reference_id, count(*)
-- from public.institute_payouts
-- where source_reference_type is not null and source_reference_id is not null
-- group by source_reference_type, source_reference_id
-- having count(*) > 1;

-- Diagnostic query: duplicate refund adjustment rows for same refund + order.
-- select refund_reference, coalesce(course_order_id::text, webinar_order_id::text) as order_id, count(*)
-- from public.institute_payouts
-- where payout_source = 'refund_adjustment' and refund_reference is not null
-- group by refund_reference, coalesce(course_order_id::text, webinar_order_id::text)
-- having count(*) > 1;

create unique index if not exists institute_payouts_source_reference_unique_idx
  on public.institute_payouts(source_reference_type, source_reference_id)
  where source_reference_type is not null
    and source_reference_id is not null;

create unique index if not exists institute_payouts_refund_reference_order_unique_idx
  on public.institute_payouts(refund_reference, coalesce(course_order_id::text, webinar_order_id::text))
  where payout_source = 'refund_adjustment'
    and refund_reference is not null
    and coalesce(course_order_id::text, webinar_order_id::text) is not null;
