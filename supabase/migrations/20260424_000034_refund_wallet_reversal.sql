-- Refund-to-wallet reversal hardening.

alter table if exists public.institute_payouts
  add column if not exists refund_amount numeric(12,2) not null default 0,
  add column if not exists refund_status text,
  add column if not exists refund_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.institute_payouts
set payout_status = 'processed'
where lower(coalesce(payout_status, '')) = 'paid';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.institute_payouts'::regclass
      and conname = 'institute_payouts_payout_status_check'
  ) then
    alter table public.institute_payouts drop constraint institute_payouts_payout_status_check;
  end if;

  alter table public.institute_payouts
    add constraint institute_payouts_payout_status_check
    check (payout_status in ('pending', 'available', 'locked', 'processing', 'processed', 'reversed', 'failed'));
end $$;

create index if not exists institute_payouts_refund_reference_idx
  on public.institute_payouts(refund_reference)
  where refund_reference is not null;

create table if not exists public.institute_payout_refund_events (
  id uuid primary key default gen_random_uuid(),
  refund_reference text not null unique,
  order_kind text not null,
  order_id uuid not null,
  refund_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

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
  v_existing_refund numeric;
  v_total numeric;
  v_applied numeric;
  v_is_full boolean;
  v_next_status text;
  v_req_id uuid;
  v_remaining numeric;
  v_alloc_id uuid;
  v_alloc_amount numeric;
  v_adjustment_id uuid;
begin
  if v_kind in ('course_order', 'course') then
    v_kind := 'course';
  elsif v_kind in ('webinar_order', 'webinar') then
    v_kind := 'webinar';
  end if;

  if v_kind not in ('course', 'webinar') then
    raise exception 'Unsupported order kind for institute payout refund: %', p_order_kind;
  end if;

  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  if p_refund_amount is null or p_refund_amount <= 0 then
    raise exception 'refund_amount must be > 0';
  end if;

  if v_ref = '' then
    raise exception 'refund_reference is required';
  end if;

  insert into public.institute_payout_refund_events (refund_reference, order_kind, order_id, refund_amount)
  values (v_ref, v_kind, p_order_id, p_refund_amount)
  on conflict (refund_reference) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'refund_reference', v_ref);
  end if;

  if v_kind = 'course' then
    select institute_id into v_institute_id from public.course_orders where id = p_order_id;
  else
    select institute_id into v_institute_id from public.webinar_orders where id = p_order_id;
  end if;

  if v_institute_id is null then
    raise exception 'Order % not found for kind %', p_order_id, v_kind;
  end if;

  select * into v_payout
  from public.institute_payouts
  where (v_kind = 'course' and course_order_id = p_order_id)
     or (v_kind = 'webinar' and webinar_order_id = p_order_id)
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.institute_payouts (
      institute_id,
      course_order_id,
      webinar_order_id,
      amount_payable,
      payout_amount,
      gross_amount,
      platform_fee_amount,
      payout_status,
      refund_amount,
      refund_status,
      refund_reference,
      payout_source,
      source_reference_id,
      source_reference_type,
      metadata,
      due_at,
      scheduled_at,
      created_at,
      updated_at
    )
    values (
      v_institute_id,
      case when v_kind = 'course' then p_order_id else null end,
      case when v_kind = 'webinar' then p_order_id else null end,
      -1 * p_refund_amount,
      -1 * p_refund_amount,
      0,
      0,
      'available',
      p_refund_amount,
      'refunded',
      v_ref,
      'refund_adjustment',
      v_ref,
      'refund_reference',
      jsonb_build_object('refund_reference', v_ref, 'refund_event_id', v_event_id),
      now(),
      now(),
      now(),
      now()
    )
    returning id into v_adjustment_id;

    return jsonb_build_object('ok', true, 'created_adjustment', true, 'adjustment_id', v_adjustment_id);
  end if;

  v_total := greatest(coalesce(v_payout.payout_amount, v_payout.amount_payable, 0), 0);
  v_existing_refund := greatest(coalesce(v_payout.refund_amount, 0), 0);
  v_applied := least(p_refund_amount, greatest(v_total - v_existing_refund, 0));

  if v_applied <= 0 then
    return jsonb_build_object('ok', true, 'idempotent', true, 'reason', 'refund_already_fully_applied');
  end if;

  v_is_full := (v_existing_refund + v_applied) >= v_total and v_total > 0;

  if v_payout.payout_status in ('pending', 'available') then
    v_next_status := case when v_is_full then 'reversed' else v_payout.payout_status end;
    update public.institute_payouts
    set
      refund_amount = v_existing_refund + v_applied,
      refund_status = case when v_is_full then 'refunded' else 'partial' end,
      refund_reference = v_ref,
      payout_status = v_next_status,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_refund_reference', v_ref, 'last_refund_amount', v_applied, 'last_refund_at', now())
    where id = v_payout.id;

  elsif v_payout.payout_status in ('locked', 'processing') then
    v_remaining := v_applied;

    for v_alloc_id, v_alloc_amount, v_req_id in
      select a.id, coalesce(a.amount, 0), a.payout_request_id
      from public.institute_payout_request_allocations a
      where a.payout_id = v_payout.id
      order by a.created_at desc
    loop
      exit when v_remaining <= 0;

      if v_alloc_amount <= v_remaining then
        v_remaining := v_remaining - v_alloc_amount;
        delete from public.institute_payout_request_allocations where id = v_alloc_id;
      else
        update public.institute_payout_request_allocations
        set amount = v_alloc_amount - v_remaining,
            updated_at = now()
        where id = v_alloc_id;
        v_remaining := 0;
      end if;

      update public.institute_payout_requests
      set
        amount = greatest(coalesce(amount, 0) - least(v_alloc_amount, v_applied), 0),
        updated_at = now()
      where id = v_req_id;
    end loop;

    v_next_status := case when v_is_full then 'reversed' else 'locked' end;
    update public.institute_payouts
    set
      refund_amount = v_existing_refund + v_applied,
      refund_status = case when v_is_full then 'refunded' else 'partial' end,
      refund_reference = v_ref,
      payout_status = v_next_status,
      payout_amount = case when v_is_full then 0 else greatest(coalesce(payout_amount, amount_payable, 0) - v_applied, 0) end,
      amount_payable = case when v_is_full then 0 else greatest(coalesce(amount_payable, payout_amount, 0) - v_applied, 0) end,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_refund_reference', v_ref, 'last_refund_amount', v_applied, 'last_refund_at', now())
    where id = v_payout.id;

  elsif v_payout.payout_status = 'processed' then
    insert into public.institute_payouts (
      institute_id,
      course_order_id,
      webinar_order_id,
      amount_payable,
      payout_amount,
      gross_amount,
      platform_fee_amount,
      payout_status,
      refund_amount,
      refund_status,
      refund_reference,
      payout_source,
      source_reference_id,
      source_reference_type,
      metadata,
      due_at,
      scheduled_at,
      created_at,
      updated_at
    )
    values (
      v_payout.institute_id,
      v_payout.course_order_id,
      v_payout.webinar_order_id,
      -1 * v_applied,
      -1 * v_applied,
      0,
      0,
      'available',
      v_applied,
      'recovery',
      v_ref,
      'refund_adjustment',
      v_ref,
      'refund_reference',
      jsonb_build_object(
        'source_payout_id', v_payout.id,
        'refund_reference', v_ref,
        'refund_event_id', v_event_id,
        'recovery_reason', 'refund_after_processed_payout'
      ),
      now(),
      now(),
      now(),
      now()
    )
    returning id into v_adjustment_id;

    update public.institute_payouts
    set
      refund_amount = v_existing_refund + v_applied,
      refund_status = case when (v_existing_refund + v_applied) >= v_total then 'refunded' else 'partial' end,
      refund_reference = v_ref,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_refund_reference', v_ref, 'last_refund_amount', v_applied, 'last_refund_at', now(), 'recovery_adjustment_id', v_adjustment_id)
    where id = v_payout.id;

  else
    update public.institute_payouts
    set
      refund_amount = v_existing_refund + v_applied,
      refund_status = case when (v_existing_refund + v_applied) >= v_total then 'refunded' else 'partial' end,
      refund_reference = v_ref,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_refund_reference', v_ref, 'last_refund_amount', v_applied, 'last_refund_at', now())
    where id = v_payout.id;
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false, 'payout_id', v_payout.id, 'refund_reference', v_ref, 'applied_amount', v_applied);
exception
  when undefined_table then
    delete from public.institute_payout_refund_events where refund_reference = v_ref;
    raise;
  when others then
    delete from public.institute_payout_refund_events where refund_reference = v_ref;
    raise;
end;
$$;
