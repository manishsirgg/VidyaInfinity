create extension if not exists pgcrypto;

-- Course orders: bridge legacy naming to hardened runtime naming.
alter table public.course_orders
  add column if not exists student_id uuid,
  add column if not exists commission_percent numeric(5,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists order_kind text,
  add column if not exists razorpay_receipt text;

update public.course_orders
set
  student_id = coalesce(student_id, user_id),
  commission_percent = coalesce(commission_percent, commission_percentage),
  platform_fee_amount = coalesce(platform_fee_amount, platform_commission_amount),
  order_kind = coalesce(order_kind, 'course_enrollment')
where
  student_id is null
  or commission_percent is null
  or platform_fee_amount is null
  or order_kind is null;

alter table public.course_orders
  alter column order_kind set default 'course_enrollment';

create index if not exists course_orders_student_id_idx on public.course_orders(student_id);
create index if not exists course_orders_course_id_idx on public.course_orders(course_id);
create index if not exists course_orders_payment_status_idx on public.course_orders(payment_status);

create unique index if not exists course_orders_razorpay_order_id_unique_idx
  on public.course_orders(razorpay_order_id);

create unique index if not exists course_orders_razorpay_payment_id_unique_idx
  on public.course_orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

-- course_enrollments: keep old order_id/user_id, add new course_order_id/student_id contract used by runtime.
alter table public.course_enrollments
  add column if not exists course_order_id uuid,
  add column if not exists student_id uuid,
  add column if not exists enrollment_status text,
  add column if not exists enrolled_at timestamptz,
  add column if not exists access_start_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.course_enrollments
set
  student_id = coalesce(student_id, user_id),
  course_order_id = coalesce(course_order_id, order_id),
  enrollment_status = coalesce(enrollment_status, 'enrolled'),
  enrolled_at = coalesce(enrolled_at, created_at),
  access_start_at = coalesce(access_start_at, enrolled_at, created_at)
where
  student_id is null
  or course_order_id is null
  or enrollment_status is null
  or enrolled_at is null
  or access_start_at is null;

create index if not exists course_enrollments_student_id_idx on public.course_enrollments(student_id);
create index if not exists course_enrollments_course_id_idx on public.course_enrollments(course_id);
create index if not exists course_enrollments_status_idx on public.course_enrollments(enrollment_status);

create unique index if not exists course_enrollments_course_order_id_unique_idx
  on public.course_enrollments(course_order_id)
  where course_order_id is not null;

create unique index if not exists course_enrollments_student_course_enrolled_unique_idx
  on public.course_enrollments(student_id, course_id)
  where enrollment_status = 'enrolled';

-- Backfill FKs only when absent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'course_orders_student_id_fkey'
      and conrelid = 'public.course_orders'::regclass
  ) then
    alter table public.course_orders
      add constraint course_orders_student_id_fkey
      foreign key (student_id) references public.profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'course_enrollments_student_id_fkey'
      and conrelid = 'public.course_enrollments'::regclass
  ) then
    alter table public.course_enrollments
      add constraint course_enrollments_student_id_fkey
      foreign key (student_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'course_enrollments_course_order_id_fkey'
      and conrelid = 'public.course_enrollments'::regclass
  ) then
    alter table public.course_enrollments
      add constraint course_enrollments_course_order_id_fkey
      foreign key (course_order_id) references public.course_orders(id) on delete set null;
  end if;
end $$;

-- Razorpay transactions: enforce runtime lookup paths and legacy backfill.
alter table public.razorpay_transactions
  add column if not exists order_kind text,
  add column if not exists course_order_id uuid,
  add column if not exists psychometric_order_id uuid,
  add column if not exists webinar_order_id uuid,
  add column if not exists event_type text,
  add column if not exists payment_status text,
  add column if not exists gateway_response jsonb not null default '{}'::jsonb,
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.razorpay_transactions
set
  order_kind = coalesce(order_kind,
    case order_type
      when 'course' then 'course_enrollment'
      when 'psychometric' then 'psychometric'
      else 'course_enrollment'
    end),
  payment_status = coalesce(payment_status, status, 'created'),
  event_type = coalesce(event_type, 'payment.captured'),
  gateway_response = coalesce(gateway_response, payload, '{}'::jsonb),
  verified = coalesce(verified, status = 'captured', false),
  verified_at = coalesce(verified_at, case when status = 'captured' then created_at else null end)
where
  order_kind is null
  or payment_status is null
  or event_type is null
  or gateway_response is null;

create index if not exists razorpay_transactions_lookup_order_idx
  on public.razorpay_transactions(razorpay_order_id);
create index if not exists razorpay_transactions_lookup_payment_idx
  on public.razorpay_transactions(razorpay_payment_id);
create index if not exists razorpay_transactions_course_order_id_idx
  on public.razorpay_transactions(course_order_id);
create index if not exists razorpay_transactions_kind_status_idx
  on public.razorpay_transactions(order_kind, payment_status);

-- institute_payouts: make payout creation idempotent for course/webinar order references.
alter table public.institute_payouts
  add column if not exists gross_amount numeric(12,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists payout_amount numeric(12,2),
  add column if not exists scheduled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.institute_payouts
set
  gross_amount = coalesce(gross_amount, amount_payable),
  payout_amount = coalesce(payout_amount, amount_payable),
  scheduled_at = coalesce(scheduled_at, due_at, created_at)
where
  gross_amount is null
  or payout_amount is null
  or scheduled_at is null;

create index if not exists institute_payouts_institute_status_idx
  on public.institute_payouts(institute_id, payout_status);

create unique index if not exists institute_payouts_course_order_unique_idx
  on public.institute_payouts(course_order_id)
  where course_order_id is not null;

create unique index if not exists institute_payouts_webinar_order_unique_idx
  on public.institute_payouts(webinar_order_id)
  where webinar_order_id is not null;

-- coupons: ensure hardened coupon validation columns exist in old environments.
alter table public.coupons
  add column if not exists active boolean not null default true,
  add column if not exists applies_to text,
  add column if not exists is_deleted boolean not null default false;

create unique index if not exists coupons_code_unique_idx on public.coupons(code);
create index if not exists coupons_scope_active_idx on public.coupons(applies_to, active, expiry_date);

-- platform commission setting singleton used by create-order.
alter table public.platform_commission_settings
  add column if not exists key text,
  add column if not exists commission_percentage numeric(5,2);

update public.platform_commission_settings
set key = coalesce(key, 'default')
where key is null;

insert into public.platform_commission_settings (key, commission_percentage)
select 'default', 12.00
where not exists (
  select 1 from public.platform_commission_settings where key = 'default'
);

create unique index if not exists platform_commission_settings_key_unique_idx
  on public.platform_commission_settings(key);

-- notifications: add resilience for runtime dedupe + feed reads.
alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists priority text not null default 'normal',
  add column if not exists target_url text,
  add column if not exists action_label text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists expires_at timestamptz,
  add column if not exists dedupe_key text;

create index if not exists idx_notifications_feed_active
  on public.notifications(user_id, is_read, created_at desc)
  where dismissed_at is null and archived_at is null;

create unique index if not exists idx_notifications_user_dedupe_key_unique
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;
