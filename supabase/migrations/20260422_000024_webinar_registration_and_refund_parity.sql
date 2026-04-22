-- Webinar registration parity + webinar refund support hardening.

alter table public.webinar_registrations
  add column if not exists institute_id uuid;

update public.webinar_registrations as wr
set institute_id = w.institute_id
from public.webinars as w
where wr.webinar_id = w.id
  and wr.institute_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webinar_registrations_institute_id_fkey'
      and conrelid = 'public.webinar_registrations'::regclass
  ) then
    alter table public.webinar_registrations
      add constraint webinar_registrations_institute_id_fkey
      foreign key (institute_id) references public.institutes(id) on delete cascade;
  end if;
end
$$;

create index if not exists webinar_registrations_institute_id_idx
  on public.webinar_registrations(institute_id);

alter table public.webinar_registrations
  alter column institute_id set not null;

alter table public.refunds
  add column if not exists webinar_order_id uuid references public.webinar_orders(id) on delete restrict;

update public.refunds as r
set webinar_order_id = rt.webinar_order_id
from public.razorpay_transactions as rt
where r.webinar_order_id is null
  and rt.webinar_order_id is not null
  and rt.razorpay_payment_id is not null
  and r.razorpay_payment_id = rt.razorpay_payment_id;

alter table public.refunds
  drop constraint if exists refunds_order_kind_check,
  drop constraint if exists refunds_order_reference_check;

alter table public.refunds
  add constraint refunds_order_kind_check
  check (order_kind in ('course_enrollment', 'psychometric_test', 'webinar')),
  add constraint refunds_order_reference_check check (
    (order_kind = 'course_enrollment' and course_order_id is not null and psychometric_order_id is null and webinar_order_id is null)
    or (order_kind = 'psychometric_test' and psychometric_order_id is not null and course_order_id is null and webinar_order_id is null)
    or (order_kind = 'webinar' and webinar_order_id is not null and course_order_id is null and psychometric_order_id is null)
  );

create unique index if not exists refunds_unique_active_webinar_order_idx
  on public.refunds(webinar_order_id)
  where webinar_order_id is not null and refund_status in ('requested', 'processing', 'refunded');

