-- Ensure paid webinar orders always converge into webinar_registrations entitlement rows.

insert into public.webinar_registrations (
  webinar_id,
  institute_id,
  student_id,
  webinar_order_id,
  registration_status,
  payment_status,
  access_status,
  registered_at,
  access_start_at,
  access_end_at,
  metadata
)
select
  wo.webinar_id,
  wo.institute_id,
  wo.student_id,
  wo.id,
  'registered',
  'paid',
  'granted',
  coalesce(wo.paid_at, wo.created_at, now()),
  coalesce(w.starts_at, wo.paid_at, wo.created_at, now()),
  w.ends_at,
  jsonb_build_object(
    'source', 'migration_paid_order_convergence',
    'paid_order_id', wo.id
  )
from public.webinar_orders wo
join public.webinars w on w.id = wo.webinar_id
where wo.payment_status = 'paid'
on conflict (webinar_id, student_id)
do update set
  webinar_order_id = excluded.webinar_order_id,
  registration_status = 'registered',
  payment_status = 'paid',
  access_status = 'granted',
  registered_at = coalesce(public.webinar_registrations.registered_at, excluded.registered_at),
  access_start_at = coalesce(public.webinar_registrations.access_start_at, excluded.access_start_at),
  access_end_at = coalesce(public.webinar_registrations.access_end_at, excluded.access_end_at),
  institute_id = excluded.institute_id,
  metadata = coalesce(public.webinar_registrations.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
