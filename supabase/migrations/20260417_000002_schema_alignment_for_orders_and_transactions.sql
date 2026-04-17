create extension if not exists pgcrypto;

create table if not exists public.platform_commission_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null default 'default',
  commission_percentage numeric(5,2) not null default 12.00 check (commission_percentage >= 0 and commission_percentage <= 100),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_commission_settings (key, commission_percentage)
values ('default', 12.00)
on conflict (key) do nothing;

create table if not exists public.course_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  institute_id uuid not null references public.institutes(id) on delete restrict,
  payment_status text not null check (payment_status in ('created', 'paid', 'failed', 'refunded')),
  gross_amount numeric(12,2) not null,
  commission_percentage numeric(5,2) not null,
  platform_commission_amount numeric(12,2) not null,
  institute_receivable_amount numeric(12,2) not null,
  final_paid_amount numeric(12,2) not null,
  currency text not null default 'INR',
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  paid_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psychometric_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  test_id uuid not null references public.psychometric_tests(id) on delete restrict,
  payment_status text not null check (payment_status in ('created', 'paid', 'failed', 'refunded')),
  base_amount numeric(12,2),
  discount_amount numeric(12,2) default 0,
  final_paid_amount numeric(12,2) not null,
  coupon_code text,
  currency text not null default 'INR',
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  paid_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.razorpay_transactions (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('course', 'psychometric')),
  order_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  razorpay_order_id text not null,
  razorpay_payment_id text not null unique,
  razorpay_signature text,
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  status text not null check (status in ('created', 'captured', 'failed', 'refunded')),
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.razorpay_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.course_enrollments
  add column if not exists order_id uuid references public.course_orders(id);

create table if not exists public.institute_payouts (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes(id) on delete restrict,
  course_order_id uuid references public.course_orders(id) on delete set null,
  amount_payable numeric(12,2) not null,
  payout_status text not null default 'pending' check (payout_status in ('pending', 'processing', 'paid', 'failed')),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
