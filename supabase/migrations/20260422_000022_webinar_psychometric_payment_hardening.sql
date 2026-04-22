-- Webinar + psychometric payment lifecycle parity hardening

alter table public.webinar_registrations
  add column if not exists access_start_at timestamptz,
  add column if not exists access_end_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.webinar_registrations
set access_start_at = coalesce(access_start_at, registered_at, created_at)
where access_start_at is null;

create index if not exists webinar_registrations_access_status_idx
  on public.webinar_registrations(access_status);

create index if not exists webinar_registrations_access_end_at_idx
  on public.webinar_registrations(access_end_at);

create unique index if not exists webinar_orders_razorpay_payment_id_unique_idx
  on public.webinar_orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists webinar_orders_razorpay_order_id_idx
  on public.webinar_orders(razorpay_order_id);

alter table public.psychometric_orders
  alter column metadata set default '{}'::jsonb;

create unique index if not exists psychometric_orders_razorpay_payment_id_unique_idx
  on public.psychometric_orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists psychometric_orders_payment_status_idx
  on public.psychometric_orders(payment_status);

create index if not exists psychometric_orders_user_test_lookup_idx
  on public.psychometric_orders(user_id, test_id, payment_status, paid_at desc);

do $$
begin
  if not exists (
    select 1
    from (
      select user_id, test_id
      from public.psychometric_orders
      where payment_status = 'paid'
      group by user_id, test_id
      having count(*) > 1
    ) dup
  ) then
    create unique index if not exists psychometric_orders_one_paid_per_user_test_idx
      on public.psychometric_orders(user_id, test_id)
      where payment_status = 'paid';
  end if;
end $$;
