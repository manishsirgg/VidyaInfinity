-- Safe additive guardrails for featured wallet debits.
-- No destructive changes.

alter table if exists public.institute_payouts
  add column if not exists payout_currency text not null default 'INR';

create unique index if not exists institute_payouts_source_reference_unique_idx
  on public.institute_payouts(source_reference_type, source_reference_id)
  where source_reference_type is not null
    and source_reference_id is not null;
