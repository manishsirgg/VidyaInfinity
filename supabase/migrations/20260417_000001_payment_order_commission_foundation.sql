-- Payment / Order / Commission foundation for Vidya Infinity
-- Safe to run in Supabase SQL editor or migration runner.

create extension if not exists pgcrypto;

create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null default 'default',
  commission_percentage numeric(5,2) not null default 12.00 check (commission_percentage >= 0 and commission_percentage <= 100),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, commission_percentage)
values ('default', 12.00)
on conflict (key) do nothing;

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  institute_id uuid not null references public.institutes(id) on delete restrict,
  enrollment_status text not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists public.course_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  institute_id uuid not null references public.institutes(id) on delete restrict,
  gross_amount numeric(12,2) not null,
  commission_percentage numeric(5,2) not null,
  platform_commission_amount numeric(12,2) not null,
  institute_receivable_amount numeric(12,2) not null,
  payment_status text not null check (payment_status in ('pending', 'successful', 'failed', 'refunded')),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  payment_method text default 'razorpay',
  metadata jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_course_transactions_course_id on public.course_transactions(course_id);
create index if not exists idx_course_transactions_user_id on public.course_transactions(user_id);
create index if not exists idx_course_transactions_status on public.course_transactions(payment_status);

create table if not exists public.test_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  test_id uuid not null references public.psychometric_tests(id) on delete restrict,
  payment_status text not null check (payment_status in ('pending', 'successful', 'failed', 'refunded')),
  base_amount numeric(12,2),
  discount_amount numeric(12,2) default 0,
  final_paid_amount numeric(12,2) not null,
  coupon_code text,
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,
  metadata jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_test_purchases_test_id on public.test_purchases(test_id);
create index if not exists idx_test_purchases_user_id on public.test_purchases(user_id);
create index if not exists idx_test_purchases_status on public.test_purchases(payment_status);

create table if not exists public.razorpay_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  razorpay_entity text,
  razorpay_entity_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_transactions enable row level security;
alter table public.test_purchases enable row level security;
alter table public.razorpay_events enable row level security;

-- RLS policies (assumes profiles table with role enum/text column)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='platform_settings' and policyname='platform_settings_admin_select') then
    create policy platform_settings_admin_select on public.platform_settings
      for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='platform_settings' and policyname='platform_settings_admin_write') then
    create policy platform_settings_admin_write on public.platform_settings
      for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_enrollments' and policyname='course_enrollments_student_select') then
    create policy course_enrollments_student_select on public.course_enrollments
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_enrollments' and policyname='course_enrollments_admin_all') then
    create policy course_enrollments_admin_all on public.course_enrollments
      for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_transactions' and policyname='course_transactions_student_select') then
    create policy course_transactions_student_select on public.course_transactions
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_transactions' and policyname='course_transactions_admin_all') then
    create policy course_transactions_admin_all on public.course_transactions
      for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='test_purchases' and policyname='test_purchases_student_select') then
    create policy test_purchases_student_select on public.test_purchases
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='test_purchases' and policyname='test_purchases_admin_all') then
    create policy test_purchases_admin_all on public.test_purchases
      for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='razorpay_events' and policyname='razorpay_events_admin_select') then
    create policy razorpay_events_admin_select on public.razorpay_events
      for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
end $$;
