-- Refund payout compatibility hardening:
-- * support legacy refund order_kind aliases
-- * compute institute reversal from receivable/payout ratios (not full student refund by default)
-- * avoid creating negative payable rows when no positive payout ledger exists
-- * repair confirmed legacy rows idempotently

create or replace function public.apply_refund_to_institute_payout(
  p_order_kind text,
  p_order_id uuid,
  p_refund_amount numeric,
  p_refund_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(coalesce(trim(p_order_kind), ''));
  v_ref text := trim(coalesce(p_refund_reference, ''));
  v_event_id uuid;
  v_payout public.institute_payouts%rowtype;
  v_institute_id uuid;
  v_existing_refund numeric := 0;
  v_total numeric := 0;
  v_applied numeric := 0;
  v_is_full boolean := false;
  v_processed_at timestamptz := now();
  v_order_total numeric := 0;
  v_order_institute_total numeric := 0;
begin
  if v_kind in ('course', 'course_order', 'course_enrollment') then v_kind := 'course';
  elsif v_kind in ('webinar', 'webinar_order', 'webinar_registration') then v_kind := 'webinar';
  end if;

  if v_kind not in ('course', 'webinar') then
    raise exception 'Unsupported order kind for institute payout refund: %', p_order_kind;
  end if;
  if p_order_id is null then raise exception 'order_id is required'; end if;
  if p_refund_amount is null or p_refund_amount <= 0 then raise exception 'refund_amount must be > 0'; end if;
  if v_ref = '' then raise exception 'refund_reference is required'; end if;

  if v_kind = 'course' then
    select institute_id, gross_amount, institute_receivable_amount
      into v_institute_id, v_order_total, v_order_institute_total
    from public.course_orders
    where id = p_order_id;
  else
    select institute_id, amount, payout_amount
      into v_institute_id, v_order_total, v_order_institute_total
    from public.webinar_orders
    where id = p_order_id;
  end if;

  if v_institute_id is null then
    raise exception 'Order % not found for kind %', p_order_id, v_kind;
  end if;

  v_order_total := greatest(coalesce(v_order_total, 0), 0);
  v_order_institute_total := greatest(coalesce(v_order_institute_total, 0), 0);

  if v_order_total > 0 and p_refund_amount >= v_order_total then
    v_applied := v_order_institute_total;
  elsif v_order_total > 0 then
    v_applied := round((v_order_institute_total * p_refund_amount) / v_order_total, 2);
  else
    v_applied := 0;
  end if;

  v_applied := greatest(v_applied, 0);

  insert into public.institute_payout_refund_events (refund_reference, order_kind, order_id, refund_amount)
  values (v_ref, v_kind, p_order_id, v_applied)
  on conflict (refund_reference) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'refund_reference', v_ref);
  end if;

  if v_applied <= 0 then
    return jsonb_build_object('ok', true, 'idempotent', false, 'event_only', true, 'reason', 'zero_institute_reversal_amount');
  end if;

  select * into v_payout
  from public.institute_payouts
  where (v_kind = 'course' and course_order_id = p_order_id)
     or (v_kind = 'webinar' and webinar_order_id = p_order_id)
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'idempotent', false, 'event_only', true, 'reason', 'no_positive_payout_ledger');
  end if;

  v_total := greatest(coalesce(v_payout.payout_amount, 0), 0);
  v_existing_refund := greatest(coalesce(v_payout.refund_amount, 0), 0);
  v_applied := least(v_applied, greatest(v_total - v_existing_refund, 0));

  if v_applied <= 0 then
    update public.institute_payouts
    set refund_status = coalesce(refund_status, 'refunded'),
        refund_reference = coalesce(refund_reference, v_ref),
        reversed_at = coalesce(reversed_at, v_processed_at),
        updated_at = now()
    where id = v_payout.id;
    return jsonb_build_object('ok', true, 'idempotent', true, 'reason', 'refund_already_fully_applied');
  end if;

  v_is_full := (v_existing_refund + v_applied) >= v_total and v_total > 0;

  update public.institute_payouts
  set refund_amount = v_existing_refund + v_applied,
      refund_status = case when v_is_full then 'refunded' else 'partial' end,
      refund_reference = v_ref,
      payout_status = case when v_is_full then 'reversed' else 'locked' end,
      payout_amount = case when v_is_full then 0 else greatest(coalesce(payout_amount, 0) - v_applied, 0) end,
      reversed_at = v_processed_at,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_refund_reference', v_ref, 'last_refund_amount', v_applied, 'last_refund_at', now())
  where id = v_payout.id;

  return jsonb_build_object('ok', true, 'idempotent', false, 'payout_id', v_payout.id, 'refund_reference', v_ref, 'applied_amount', v_applied);
exception
  when others then
    delete from public.institute_payout_refund_events where refund_reference = v_ref;
    raise;
end;
$$;

-- One-time repair for confirmed legacy rows.
update public.course_orders co
set payment_status = 'refunded',
    updated_at = now()
from public.refunds r
where r.id = 'bda39025-de1b-42e9-88a8-37a169a810f7'
  and r.refund_status = 'refunded'
  and co.id = 'bcf2e6f2-3eee-448b-92c9-9de3dc1c647d'
  and co.id = r.course_order_id;

update public.institute_payouts p
set payout_status = 'reversed',
    payout_amount = 0,
    refund_amount = 90.00,
    refund_status = 'refunded',
    refund_reference = 'rfnd_SgWec5gL9SbMvS',
    reversed_at = coalesce(r.processed_at, now()),
    updated_at = now()
from public.refunds r
where p.id = 'd98537b9-59d8-45d6-9312-e293726c75f5'
  and r.id = 'bda39025-de1b-42e9-88a8-37a169a810f7'
  and r.refund_status = 'refunded';

insert into public.institute_payout_refund_events (refund_reference, order_kind, order_id, refund_amount)
select coalesce(nullif(trim(r.razorpay_refund_id), ''), r.id::text),
       'course',
       r.course_order_id,
       90.00
from public.refunds r
where r.id = 'bda39025-de1b-42e9-88a8-37a169a810f7'
  and r.refund_status = 'refunded'
on conflict (refund_reference) do nothing;

insert into public.institute_payout_refund_events (refund_reference, order_kind, order_id, refund_amount)
select coalesce(nullif(trim(r.razorpay_refund_id), ''), r.id::text),
       case when r.course_order_id is not null then 'course' else 'webinar' end,
       coalesce(r.course_order_id, r.webinar_order_id),
       case
         when r.course_order_id = '6b415b92-ae05-4520-9fdc-5f93722199a9' then 9.00
         when r.course_order_id = '4659007a-bb43-4a40-b4db-166e72297c4d' then 9.00
         when r.webinar_order_id = '124b78be-9b36-4eb1-95cd-aa89dfe1935b' then 8.80
         else 0
       end
from public.refunds r
where r.id in (
  'aa060b0f-3d22-47dd-88c0-ab59d7742ef4',
  'ecbedcc6-909e-4692-9772-e4d66f0eef29',
  '0cb5c326-127e-42d7-8992-1a9cc23571ff'
)
  and r.refund_status = 'refunded'
on conflict (refund_reference) do nothing;
