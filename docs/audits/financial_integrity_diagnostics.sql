-- Financial integrity diagnostics: refunded orders must have payout reversal bookkeeping.
-- Schema assumptions: coupons.active, razorpay_transactions.order_kind, refunds, institute_payouts, institute_payout_refund_events.

with refunded_course_or_webinar as (
  select
    r.id as refund_id,
    r.order_kind,
    coalesce(r.course_order_id::text, r.webinar_order_id::text) as order_id,
    r.razorpay_refund_id,
    r.refund_status,
    r.amount as student_refund_amount
  from public.refunds r
  where r.refund_status = 'refunded'
    and (r.course_order_id is not null or r.webinar_order_id is not null)
), payout_rows as (
  select
    ip.id as payout_id,
    coalesce(ip.course_order_id::text, ip.webinar_order_id::text) as order_id,
    ip.payout_status,
    ip.refund_amount,
    ip.refund_status,
    ip.refund_reference,
    ip.reversed_at,
    ip.payout_source,
    ip.payout_amount
  from public.institute_payouts ip
  where ip.course_order_id is not null or ip.webinar_order_id is not null
), joined as (
  select
    rcw.refund_id,
    rcw.order_kind,
    rcw.order_id,
    rcw.razorpay_refund_id,
    rcw.student_refund_amount,
    p.payout_id,
    p.payout_status,
    p.refund_amount,
    p.refund_status,
    p.refund_reference,
    p.reversed_at,
    p.payout_source,
    p.payout_amount,
    e.id as refund_event_id
  from refunded_course_or_webinar rcw
  left join payout_rows p on p.order_id = rcw.order_id
  left join public.institute_payout_refund_events e
    on e.refund_reference = coalesce(nullif(rcw.razorpay_refund_id, ''), rcw.refund_id::text)
)
select
  refund_id,
  order_kind,
  order_id,
  payout_id,
  payout_status,
  refund_amount,
  refund_status,
  refund_reference,
  reversed_at,
  payout_source,
  payout_amount,
  refund_event_id,
  case
    when payout_id is null then 'missing_payout_row'
    when payout_status = 'available' then 'stale_available_payout'
    when coalesce(refund_amount, 0) <= 0 then 'refund_amount_not_applied'
    when coalesce(refund_status, '') not in ('refunded', 'partial', 'recovery') then 'unexpected_refund_status'
    when coalesce(refund_reference, '') = '' then 'missing_refund_reference'
    when reversed_at is null then 'missing_reversed_at'
    when refund_event_id is null then 'missing_refund_event'
    else null
  end as issue
from joined
where
  payout_id is null
  or payout_status = 'available'
  or coalesce(refund_amount, 0) <= 0
  or coalesce(refund_status, '') not in ('refunded', 'partial', 'recovery')
  or coalesce(refund_reference, '') = ''
  or reversed_at is null
  or refund_event_id is null
order by refund_id;

-- Narrow refund/payout compatibility diagnostics.

-- 1) Refunded refund rows where linked order is still paid.
select
  r.id as refund_id,
  r.order_kind,
  r.course_order_id,
  co.payment_status as course_payment_status,
  r.webinar_order_id,
  wo.payment_status as webinar_payment_status
from public.refunds r
left join public.course_orders co on co.id = r.course_order_id
left join public.webinar_orders wo on wo.id = r.webinar_order_id
where r.refund_status = 'refunded'
  and (
    (r.course_order_id is not null and lower(coalesce(co.payment_status, '')) = 'paid')
    or (r.webinar_order_id is not null and lower(coalesce(wo.payment_status, '')) = 'paid')
  )
order by r.created_at desc;

-- 2) Refunded refund rows where linked payout is still available.
select
  r.id as refund_id,
  r.order_kind,
  p.id as payout_id,
  p.payout_status,
  p.refund_amount,
  p.refund_reference,
  p.reversed_at
from public.refunds r
join public.institute_payouts p
  on (r.course_order_id is not null and p.course_order_id = r.course_order_id)
  or (r.webinar_order_id is not null and p.webinar_order_id = r.webinar_order_id)
where r.refund_status = 'refunded'
  and lower(coalesce(p.payout_status, '')) = 'available'
order by r.created_at desc;

-- 3) Refunded refund rows with missing payout refund event.
select
  r.id as refund_id,
  r.order_kind,
  coalesce(r.course_order_id, r.webinar_order_id) as order_id,
  coalesce(nullif(trim(r.razorpay_refund_id), ''), r.id::text) as expected_refund_reference
from public.refunds r
left join public.institute_payout_refund_events e
  on e.refund_reference = coalesce(nullif(trim(r.razorpay_refund_id), ''), r.id::text)
where r.refund_status = 'refunded'
  and (r.course_order_id is not null or r.webinar_order_id is not null)
  and e.id is null
order by r.created_at desc;

-- 4) Refunded refund rows still on legacy alias order kinds.
select
  r.id as refund_id,
  r.order_kind,
  r.course_order_id,
  r.webinar_order_id,
  r.amount,
  r.processed_at
from public.refunds r
where r.refund_status = 'refunded'
  and lower(coalesce(r.order_kind, '')) in ('course_enrollment', 'webinar_registration')
order by r.created_at desc;
