create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.webinar_orders (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  institute_id uuid not null references public.institutes(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'INR',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  order_status text not null default 'pending' check (order_status in ('pending', 'confirmed', 'failed', 'cancelled')),
  access_status text not null default 'locked' check (access_status in ('locked', 'granted', 'revoked')),
  platform_fee_percent numeric(5,2) not null check (platform_fee_percent >= 0 and platform_fee_percent <= 100),
  platform_fee_amount numeric(12,2) not null check (platform_fee_amount >= 0),
  payout_amount numeric(12,2) not null check (payout_amount >= 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  razorpay_signature text,
  razorpay_receipt text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webinar_orders_webinar_id_idx on public.webinar_orders(webinar_id);
create index if not exists webinar_orders_student_id_idx on public.webinar_orders(student_id);
create index if not exists webinar_orders_institute_id_idx on public.webinar_orders(institute_id);
create index if not exists webinar_orders_payment_status_idx on public.webinar_orders(payment_status);

create table if not exists public.webinar_registrations (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  institute_id uuid not null references public.institutes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  webinar_order_id uuid references public.webinar_orders(id) on delete set null,
  registration_status text not null default 'registered' check (registration_status in ('registered', 'cancelled')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded')),
  access_status text not null default 'granted' check (access_status in ('granted', 'locked', 'revoked')),
  registered_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webinar_id, student_id)
);

create index if not exists webinar_registrations_webinar_id_idx on public.webinar_registrations(webinar_id);
create index if not exists webinar_registrations_student_id_idx on public.webinar_registrations(student_id);
create index if not exists webinar_registrations_institute_id_idx on public.webinar_registrations(institute_id);

alter table public.institute_payouts
  add column if not exists webinar_order_id uuid references public.webinar_orders(id) on delete set null,
  add column if not exists payout_source text,
  add column if not exists source_reference_id text,
  add column if not exists source_reference_type text,
  add column if not exists gross_amount numeric(12,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists payout_amount numeric(12,2),
  add column if not exists scheduled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_webinar_orders_updated_at on public.webinar_orders;
create trigger trg_webinar_orders_updated_at
before update on public.webinar_orders
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_webinar_registrations_updated_at on public.webinar_registrations;
create trigger trg_webinar_registrations_updated_at
before update on public.webinar_registrations
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_institute_payouts_updated_at on public.institute_payouts;
create trigger trg_institute_payouts_updated_at
before update on public.institute_payouts
for each row
execute function public.set_timestamp_updated_at();
