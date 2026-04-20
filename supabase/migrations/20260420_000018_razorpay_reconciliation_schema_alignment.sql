create extension if not exists pgcrypto;

alter table public.razorpay_transactions
  add column if not exists order_kind text,
  add column if not exists course_order_id uuid references public.course_orders(id) on delete set null,
  add column if not exists psychometric_order_id uuid references public.psychometric_orders(id) on delete set null,
  add column if not exists webinar_order_id uuid references public.webinar_orders(id) on delete set null,
  add column if not exists institute_id uuid references public.institutes(id) on delete set null,
  add column if not exists event_type text,
  add column if not exists payment_status text,
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists gateway_response jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.razorpay_transactions
set
  order_kind = coalesce(
    order_kind,
    case order_type
      when 'course' then 'course_enrollment'
      when 'psychometric' then 'psychometric'
      else null
    end
  ),
  payment_status = coalesce(payment_status, status, 'paid'),
  event_type = coalesce(event_type, 'payment.captured'),
  gateway_response = coalesce(gateway_response, payload, '{}'::jsonb),
  verified = coalesce(verified, status = 'captured', false),
  verified_at = coalesce(verified_at, case when status = 'captured' then now() else null end),
  updated_at = now();

alter table public.razorpay_transactions
  alter column order_kind set not null,
  alter column payment_status set not null,
  alter column event_type set not null;

alter table public.razorpay_transactions
  drop constraint if exists razorpay_transactions_order_kind_check;

alter table public.razorpay_transactions
  add constraint razorpay_transactions_order_kind_check
  check (order_kind in ('course_enrollment', 'psychometric', 'webinar'));

alter table public.razorpay_transactions
  drop constraint if exists razorpay_transactions_payment_status_check;

alter table public.razorpay_transactions
  add constraint razorpay_transactions_payment_status_check
  check (payment_status in ('created', 'paid', 'failed', 'refunded'));

create index if not exists razorpay_transactions_order_kind_idx on public.razorpay_transactions(order_kind);
create index if not exists razorpay_transactions_course_order_id_idx on public.razorpay_transactions(course_order_id);
create index if not exists razorpay_transactions_psychometric_order_id_idx on public.razorpay_transactions(psychometric_order_id);
create index if not exists razorpay_transactions_webinar_order_id_idx on public.razorpay_transactions(webinar_order_id);

alter table public.razorpay_webhook_logs
  alter column signature_valid drop not null;

alter table public.razorpay_webhook_logs
  add column if not exists signature text,
  add column if not exists headers jsonb not null default '{}'::jsonb,
  add column if not exists processed boolean not null default false,
  add column if not exists processed_at timestamptz,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.razorpay_webhook_logs
set
  signature_valid = coalesce(signature_valid, false),
  headers = coalesce(headers, '{}'::jsonb),
  processed = coalesce(processed, false),
  updated_at = now();

alter table public.razorpay_webhook_logs
  alter column signature_valid set not null;

create unique index if not exists razorpay_webhook_logs_event_idx
  on public.razorpay_webhook_logs (event_id, event_type)
  where event_id is not null;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_razorpay_transactions_updated_at on public.razorpay_transactions;
create trigger trg_razorpay_transactions_updated_at
before update on public.razorpay_transactions
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_razorpay_webhook_logs_updated_at on public.razorpay_webhook_logs;
create trigger trg_razorpay_webhook_logs_updated_at
before update on public.razorpay_webhook_logs
for each row
execute function public.set_timestamp_updated_at();
