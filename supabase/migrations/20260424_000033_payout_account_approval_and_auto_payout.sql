-- Additive payout account approval + proof + automation metadata.

alter table if exists public.institute_payout_accounts
  add column if not exists proof_document_url text,
  add column if not exists proof_document_path text,
  add column if not exists proof_document_name text,
  add column if not exists proof_document_verified_at timestamptz,
  add column if not exists proof_document_notes text,
  add column if not exists proof_document_required boolean not null default false,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_notes text,
  add column if not exists rejection_reason text,
  add column if not exists auto_payout_enabled boolean not null default false,
  add column if not exists auto_payout_provider text,
  add column if not exists auto_payout_provider_account_ref text,
  add column if not exists last_auto_payout_attempt_at timestamptz,
  add column if not exists last_auto_payout_error text,
  add column if not exists payout_mode text not null default 'manual';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'institute_payout_accounts' and column_name = 'verification_status'
  ) then
    update public.institute_payout_accounts
    set verification_status = case
      when lower(coalesce(verification_status, '')) in ('approved', 'verified') then 'approved'
      when lower(coalesce(verification_status, '')) in ('rejected') then 'rejected'
      when lower(coalesce(verification_status, '')) in ('disabled', 'inactive') then 'disabled'
      else 'pending'
    end
    where lower(coalesce(verification_status, '')) not in ('pending', 'approved', 'rejected', 'disabled');
  end if;
end $$;

alter table if exists public.institute_payout_accounts
  drop constraint if exists institute_payout_accounts_payout_mode_check;
alter table if exists public.institute_payout_accounts
  add constraint institute_payout_accounts_payout_mode_check
  check (payout_mode in ('manual', 'auto'));

create table if not exists public.institute_payout_transfer_attempts (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null,
  institute_id uuid not null,
  payout_account_id uuid not null,
  provider text,
  status text not null default 'attempting',
  requested_amount numeric(12,2) not null default 0,
  provider_reference text,
  provider_response jsonb,
  error_message text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  initiated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payout_transfer_attempts_request on public.institute_payout_transfer_attempts (payout_request_id, attempted_at desc);
create unique index if not exists uq_payout_transfer_success on public.institute_payout_transfer_attempts (payout_request_id) where status = 'success';
