-- Align razorpay_transactions.order_kind to canonical values used by application reconciliation.

update public.razorpay_transactions
set order_kind = case
  when order_kind = 'psychometric' then 'psychometric_test'
  when order_kind = 'webinar' then 'webinar_registration'
  else order_kind
end
where order_kind in ('psychometric', 'webinar');

alter table public.razorpay_transactions
  drop constraint if exists razorpay_transactions_order_kind_check;

alter table public.razorpay_transactions
  add constraint razorpay_transactions_order_kind_check
  check (order_kind in ('course_enrollment', 'psychometric_test', 'webinar_registration'));
