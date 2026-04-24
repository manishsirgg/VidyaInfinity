-- Keep webinar payout ledger rows in sync with paid webinar orders.

create or replace function public.sync_institute_payout_from_webinar_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status <> 'paid' then
    return new;
  end if;

  insert into public.institute_payouts (
    institute_id,
    webinar_order_id,
    source_reference_id,
    source_reference_type,
    payout_source,
    gross_amount,
    platform_fee_amount,
    payout_amount,
    amount_payable,
    payout_status,
    available_at,
    due_at,
    scheduled_at,
    created_at,
    updated_at
  )
  values (
    new.institute_id,
    new.id,
    new.id::text,
    'webinar_order',
    'webinar',
    coalesce(new.amount, 0),
    coalesce(new.platform_fee_amount, 0),
    coalesce(new.payout_amount, greatest(coalesce(new.amount, 0) - coalesce(new.platform_fee_amount, 0), 0)),
    coalesce(new.payout_amount, greatest(coalesce(new.amount, 0) - coalesce(new.platform_fee_amount, 0), 0)),
    'available',
    coalesce(new.paid_at, new.created_at, now()),
    coalesce(new.paid_at, new.created_at, now()),
    coalesce(new.paid_at, new.created_at, now()),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (webinar_order_id)
  do update
    set institute_id = excluded.institute_id,
        source_reference_id = excluded.source_reference_id,
        source_reference_type = excluded.source_reference_type,
        payout_source = excluded.payout_source,
        gross_amount = excluded.gross_amount,
        platform_fee_amount = excluded.platform_fee_amount,
        payout_amount = excluded.payout_amount,
        amount_payable = excluded.amount_payable,
        payout_status = case
          when public.institute_payouts.payout_status in ('processed', 'reversed', 'failed') then public.institute_payouts.payout_status
          else 'available'
        end,
        available_at = excluded.available_at,
        due_at = excluded.due_at,
        scheduled_at = excluded.scheduled_at,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_institute_payout_from_webinar_order on public.webinar_orders;
create trigger trg_sync_institute_payout_from_webinar_order
after insert or update of payment_status, amount, platform_fee_amount, payout_amount, paid_at, institute_id
on public.webinar_orders
for each row
execute function public.sync_institute_payout_from_webinar_order();

insert into public.institute_payouts (
  institute_id,
  webinar_order_id,
  source_reference_id,
  source_reference_type,
  payout_source,
  gross_amount,
  platform_fee_amount,
  payout_amount,
  amount_payable,
  payout_status,
  available_at,
  due_at,
  scheduled_at,
  created_at,
  updated_at
)
select
  o.institute_id,
  o.id,
  o.id::text,
  'webinar_order',
  'webinar',
  coalesce(o.amount, 0),
  coalesce(o.platform_fee_amount, 0),
  coalesce(o.payout_amount, greatest(coalesce(o.amount, 0) - coalesce(o.platform_fee_amount, 0), 0)),
  coalesce(o.payout_amount, greatest(coalesce(o.amount, 0) - coalesce(o.platform_fee_amount, 0), 0)),
  'available',
  coalesce(o.paid_at, o.created_at, now()),
  coalesce(o.paid_at, o.created_at, now()),
  coalesce(o.paid_at, o.created_at, now()),
  coalesce(o.created_at, now()),
  now()
from public.webinar_orders o
left join public.institute_payouts p
  on p.webinar_order_id = o.id
where o.payment_status = 'paid'
  and p.id is null
on conflict (webinar_order_id)
do update
  set institute_id = excluded.institute_id,
      source_reference_id = excluded.source_reference_id,
      source_reference_type = excluded.source_reference_type,
      payout_source = excluded.payout_source,
      gross_amount = excluded.gross_amount,
      platform_fee_amount = excluded.platform_fee_amount,
      payout_amount = excluded.payout_amount,
      amount_payable = excluded.amount_payable,
      payout_status = case
        when public.institute_payouts.payout_status in ('processed', 'reversed', 'failed') then public.institute_payouts.payout_status
        else 'available'
      end,
      available_at = excluded.available_at,
      due_at = excluded.due_at,
      scheduled_at = excluded.scheduled_at,
      updated_at = now();
