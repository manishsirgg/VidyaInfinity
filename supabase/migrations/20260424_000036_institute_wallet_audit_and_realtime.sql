-- Institute wallet financial event audit trail and realtime hardening.

create table if not exists public.institute_wallet_audit_logs (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  event_type text not null,
  source_table text,
  source_id uuid,
  payout_id uuid,
  payout_request_id uuid,
  order_id uuid,
  order_kind text,
  amount numeric(12,2),
  previous_status text,
  new_status text,
  actor_user_id uuid,
  actor_role text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists institute_wallet_audit_logs_institute_created_idx
  on public.institute_wallet_audit_logs (institute_id, created_at desc);
create index if not exists institute_wallet_audit_logs_event_type_idx
  on public.institute_wallet_audit_logs (event_type);
create index if not exists institute_wallet_audit_logs_source_id_idx
  on public.institute_wallet_audit_logs (source_id);
create unique index if not exists institute_wallet_audit_logs_idempotency_key_uq
  on public.institute_wallet_audit_logs (idempotency_key)
  where idempotency_key is not null;

create or replace function public.log_institute_payout_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_metadata jsonb := '{}'::jsonb;
  v_idempotency_key text;
  v_is_only_updated_at_change boolean;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'payout_created';
    v_idempotency_key := format('payout_audit:%s:%s', new.id, v_event_type);

    insert into public.institute_wallet_audit_logs (
      institute_id,
      event_type,
      source_table,
      source_id,
      payout_id,
      order_id,
      order_kind,
      amount,
      new_status,
      idempotency_key,
      metadata
    )
    values (
      new.institute_id,
      v_event_type,
      'institute_payouts',
      new.id,
      new.id,
      coalesce(new.course_order_id, new.webinar_order_id),
      case
        when new.course_order_id is not null then 'course'
        when new.webinar_order_id is not null then 'webinar'
        else null
      end,
      coalesce(new.payout_amount, new.amount_payable, 0),
      new.payout_status,
      v_idempotency_key,
      jsonb_build_object('payout_source', new.payout_source)
    )
    on conflict do nothing;

    return new;
  end if;

  v_is_only_updated_at_change :=
    old.payout_status is not distinct from new.payout_status
    and old.refund_amount is not distinct from new.refund_amount
    and old.refund_reference is not distinct from new.refund_reference
    and old.payout_amount is not distinct from new.payout_amount
    and old.amount_payable is not distinct from new.amount_payable
    and old.locked_at is not distinct from new.locked_at
    and old.processed_at is not distinct from new.processed_at
    and old.failed_at is not distinct from new.failed_at
    and old.metadata is not distinct from new.metadata;

  if v_is_only_updated_at_change then
    return new;
  end if;

  if old.payout_status is distinct from new.payout_status then
    v_event_type := 'payout_status_changed';
    v_idempotency_key := format('payout_audit:%s:%s:%s', new.id, v_event_type, coalesce(new.payout_status, 'null'));

    insert into public.institute_wallet_audit_logs (
      institute_id,
      event_type,
      source_table,
      source_id,
      payout_id,
      order_id,
      order_kind,
      amount,
      previous_status,
      new_status,
      idempotency_key,
      metadata
    )
    values (
      new.institute_id,
      v_event_type,
      'institute_payouts',
      new.id,
      new.id,
      coalesce(new.course_order_id, new.webinar_order_id),
      case
        when new.course_order_id is not null then 'course'
        when new.webinar_order_id is not null then 'webinar'
        else null
      end,
      coalesce(new.payout_amount, new.amount_payable, 0),
      old.payout_status,
      new.payout_status,
      v_idempotency_key,
      jsonb_build_object('payout_source', new.payout_source)
    )
    on conflict do nothing;

    if new.payout_status = 'processed' then
      insert into public.institute_wallet_audit_logs (
        institute_id,
        event_type,
        source_table,
        source_id,
        payout_id,
        order_id,
        order_kind,
        amount,
        previous_status,
        new_status,
        idempotency_key,
        metadata
      )
      values (
        new.institute_id,
        'payout_processed',
        'institute_payouts',
        new.id,
        new.id,
        coalesce(new.course_order_id, new.webinar_order_id),
        case
          when new.course_order_id is not null then 'course'
          when new.webinar_order_id is not null then 'webinar'
          else null
        end,
        coalesce(new.payout_amount, new.amount_payable, 0),
        old.payout_status,
        new.payout_status,
        format('payout_audit:%s:payout_processed:%s', new.id, coalesce(new.processed_at::text, new.updated_at::text, now()::text)),
        jsonb_build_object('payout_source', new.payout_source)
      )
      on conflict do nothing;
    elsif new.payout_status = 'reversed' then
      insert into public.institute_wallet_audit_logs (
        institute_id,
        event_type,
        source_table,
        source_id,
        payout_id,
        order_id,
        order_kind,
        amount,
        previous_status,
        new_status,
        idempotency_key,
        metadata
      )
      values (
        new.institute_id,
        'payout_reversed',
        'institute_payouts',
        new.id,
        new.id,
        coalesce(new.course_order_id, new.webinar_order_id),
        case
          when new.course_order_id is not null then 'course'
          when new.webinar_order_id is not null then 'webinar'
          else null
        end,
        coalesce(new.refund_amount, new.payout_amount, new.amount_payable, 0),
        old.payout_status,
        new.payout_status,
        format('payout_audit:%s:payout_reversed:%s', new.id, coalesce(new.refund_reference, new.updated_at::text, now()::text)),
        jsonb_build_object('payout_source', new.payout_source, 'refund_reference', new.refund_reference)
      )
      on conflict do nothing;
    end if;
  end if;

  if coalesce(new.refund_amount, 0) > coalesce(old.refund_amount, 0) then
    v_metadata := jsonb_build_object(
      'payout_source', new.payout_source,
      'refund_reference', new.refund_reference,
      'refund_increment', coalesce(new.refund_amount, 0) - coalesce(old.refund_amount, 0)
    );

    insert into public.institute_wallet_audit_logs (
      institute_id,
      event_type,
      source_table,
      source_id,
      payout_id,
      order_id,
      order_kind,
      amount,
      previous_status,
      new_status,
      idempotency_key,
      metadata
    )
    values (
      new.institute_id,
      'refund_applied',
      'institute_payouts',
      new.id,
      new.id,
      coalesce(new.course_order_id, new.webinar_order_id),
      case
        when new.course_order_id is not null then 'course'
        when new.webinar_order_id is not null then 'webinar'
        else null
      end,
      coalesce(new.refund_amount, 0) - coalesce(old.refund_amount, 0),
      old.payout_status,
      new.payout_status,
      format('payout_audit:%s:refund:%s:%s', new.id, coalesce(new.refund_reference, 'no-ref'), coalesce(new.refund_amount, 0)::text),
      v_metadata
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_institute_payout_audit_event on public.institute_payouts;
create trigger trg_log_institute_payout_audit_event
after insert or update on public.institute_payouts
for each row
execute function public.log_institute_payout_audit_event();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_publication p on p.oid = pr.prpubid
      where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'institute_payouts'
    ) then
      alter publication supabase_realtime add table public.institute_payouts;
    end if;

    if not exists (
      select 1 from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_publication p on p.oid = pr.prpubid
      where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'institute_payout_requests'
    ) then
      alter publication supabase_realtime add table public.institute_payout_requests;
    end if;

    if not exists (
      select 1 from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_publication p on p.oid = pr.prpubid
      where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'institute_payout_accounts'
    ) then
      alter publication supabase_realtime add table public.institute_payout_accounts;
    end if;
  end if;
end $$;
