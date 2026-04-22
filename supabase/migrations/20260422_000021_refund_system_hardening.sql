create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'refund_status' and typnamespace = 'public'::regnamespace) then
    create type public.refund_status as enum ('requested', 'processing', 'refunded', 'failed', 'cancelled');
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'refund_status'
  ) then
    alter table public.refunds rename column status to refund_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'admin_note'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'internal_notes'
  ) then
    alter table public.refunds rename column admin_note to internal_notes;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'order_type'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds' and column_name = 'order_kind'
  ) then
    alter table public.refunds rename column order_type to order_kind;
  end if;
end $$;

alter table public.refunds
  add column if not exists institute_id uuid references public.institutes(id) on delete set null,
  add column if not exists amount numeric(12,2),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_refund_id text,
  add column if not exists processed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

alter table public.refunds
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column reason set not null,
  alter column order_kind type text using order_kind::text;

update public.refunds
set
  order_kind = case
    when order_kind in ('course', 'course_enrollment') then 'course_enrollment'
    when order_kind in ('psychometric', 'psychometric_test') then 'psychometric_test'
    else order_kind
  end,
  refund_status = case
    when refund_status in ('approved') then 'processing'
    when refund_status in ('processed') then 'refunded'
    when refund_status in ('rejected', 'reject') then 'cancelled'
    when refund_status in ('requested', 'processing', 'refunded', 'failed', 'cancelled') then refund_status
    else 'requested'
  end;

alter table public.refunds
  alter column refund_status type public.refund_status
  using refund_status::public.refund_status;

alter table public.refunds
  alter column order_kind set not null,
  alter column refund_status set default 'requested',
  alter column refund_status set not null;

update public.refunds as r
set
  amount = coalesce(
    r.amount,
    case
      when r.order_kind = 'course_enrollment' then coalesce((select c.gross_amount from public.course_orders c where c.id = r.course_order_id), 0)
      when r.order_kind = 'psychometric_test' then coalesce((select p.final_paid_amount from public.psychometric_orders p where p.id = r.psychometric_order_id), 0)
      else 0
    end
  );

alter table public.refunds
  alter column amount set not null;

update public.refunds as r
set razorpay_payment_id = coalesce(
  r.razorpay_payment_id,
  case
    when r.order_kind = 'course_enrollment' then (select c.razorpay_payment_id from public.course_orders c where c.id = r.course_order_id)
    when r.order_kind = 'psychometric_test' then (select p.razorpay_payment_id from public.psychometric_orders p where p.id = r.psychometric_order_id)
    else null
  end
);

alter table public.refunds
  drop constraint if exists refunds_status_check,
  drop constraint if exists refunds_order_type_check,
  drop constraint if exists refunds_order_kind_check,
  drop constraint if exists refunds_amount_non_negative,
  drop constraint if exists refunds_order_reference_check,
  drop constraint if exists refunds_course_order_id_fkey,
  drop constraint if exists refunds_psychometric_order_id_fkey;

alter table public.refunds
  add constraint refunds_order_kind_check check (order_kind in ('course_enrollment', 'psychometric_test')),
  add constraint refunds_amount_non_negative check (amount >= 0),
  add constraint refunds_order_reference_check check (
    (order_kind = 'course_enrollment' and course_order_id is not null and psychometric_order_id is null)
    or (order_kind = 'psychometric_test' and psychometric_order_id is not null and course_order_id is null)
  ),
  add constraint refunds_course_order_id_fkey foreign key (course_order_id) references public.course_orders(id) on delete restrict,
  add constraint refunds_psychometric_order_id_fkey foreign key (psychometric_order_id) references public.psychometric_orders(id) on delete restrict;

create unique index if not exists refunds_unique_active_course_order_idx
  on public.refunds(course_order_id)
  where course_order_id is not null and refund_status in ('requested', 'processing', 'refunded');

create unique index if not exists refunds_unique_active_psychometric_order_idx
  on public.refunds(psychometric_order_id)
  where psychometric_order_id is not null and refund_status in ('requested', 'processing', 'refunded');

create unique index if not exists refunds_razorpay_refund_id_unique_idx
  on public.refunds(razorpay_refund_id)
  where razorpay_refund_id is not null;

create index if not exists refunds_user_id_idx on public.refunds(user_id);
create index if not exists refunds_status_idx on public.refunds(refund_status);
create index if not exists refunds_requested_at_idx on public.refunds(requested_at desc);
create index if not exists refunds_razorpay_payment_id_idx on public.refunds(razorpay_payment_id);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_refunds_updated_at on public.refunds;
create trigger trg_refunds_updated_at
before update on public.refunds
for each row
execute function public.set_timestamp_updated_at();

alter table public.refunds enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

drop policy if exists refunds_select_own on public.refunds;
create policy refunds_select_own
  on public.refunds
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists refunds_insert_own on public.refunds;
create policy refunds_insert_own
  on public.refunds
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists refunds_admin_all on public.refunds;
create policy refunds_admin_all
  on public.refunds
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());
