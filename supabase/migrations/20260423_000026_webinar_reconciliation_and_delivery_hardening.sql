-- Webinar reconciliation + access delivery state hardening

alter table public.webinar_registrations
  add column if not exists access_granted_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists access_delivery_status text not null default 'pending'
    check (access_delivery_status in ('pending', 'delivered', 'failed'));

create index if not exists webinar_registrations_access_delivery_status_idx
  on public.webinar_registrations(access_delivery_status);

create index if not exists webinar_orders_paid_confirmed_idx
  on public.webinar_orders(payment_status, order_status, paid_at desc);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'webinar_orders_order_status_check'
      and conrelid = 'public.webinar_orders'::regclass
  ) then
    alter table public.webinar_orders
      drop constraint webinar_orders_order_status_check;
  end if;

  alter table public.webinar_orders
    add constraint webinar_orders_order_status_check
    check (order_status in ('pending', 'confirmed', 'completed', 'failed', 'cancelled', 'refunded'));
end
$$;
