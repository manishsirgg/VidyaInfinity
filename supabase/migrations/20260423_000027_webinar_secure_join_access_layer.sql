-- Webinar secure join access layer metadata hardening.

alter table public.webinar_registrations
  add column if not exists reveal_started_at timestamptz,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists delivery_error text;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'webinar_registrations_access_delivery_status_check' and conrelid = 'public.webinar_registrations'::regclass
  ) then
    alter table public.webinar_registrations drop constraint webinar_registrations_access_delivery_status_check;
  end if;

  alter table public.webinar_registrations
    add constraint webinar_registrations_access_delivery_status_check
    check (access_delivery_status in ('pending', 'revealed', 'delivered', 'failed'));
end
$$;

create index if not exists webinar_registrations_reveal_started_at_idx on public.webinar_registrations(reveal_started_at);
create index if not exists webinar_registrations_last_delivery_attempt_at_idx on public.webinar_registrations(last_delivery_attempt_at);
