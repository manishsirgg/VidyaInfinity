create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'organization_type'
  ) then
    create type public.organization_type as enum (
      'Coaching Institute',
      'Academy',
      'College',
      'University',
      'School',
      'Skill Center',
      'Training Institute'
    );
  end if;
end $$;

alter type public.organization_type add value if not exists 'Coaching Institute';
alter type public.organization_type add value if not exists 'Academy';
alter type public.organization_type add value if not exists 'College';
alter type public.organization_type add value if not exists 'University';
alter type public.organization_type add value if not exists 'School';
alter type public.organization_type add value if not exists 'Skill Center';
alter type public.organization_type add value if not exists 'Training Institute';

create table if not exists public.entity_commissions (
  id uuid primary key default gen_random_uuid(),
  entity_type public.organization_type unique not null,
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webinar_commission_settings (
  id uuid primary key default gen_random_uuid(),
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_entity_commissions_updated_at on public.entity_commissions;
create trigger trg_entity_commissions_updated_at
before update on public.entity_commissions
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists trg_webinar_commission_settings_updated_at on public.webinar_commission_settings;
create trigger trg_webinar_commission_settings_updated_at
before update on public.webinar_commission_settings
for each row
execute function public.set_timestamp_updated_at();

insert into public.entity_commissions (entity_type, commission_percent, is_active)
values
  ('Coaching Institute', 12.00, true),
  ('Academy', 12.00, true),
  ('College', 12.00, true),
  ('University', 12.00, true),
  ('School', 12.00, true),
  ('Skill Center', 12.00, true),
  ('Training Institute', 12.00, true)
on conflict (entity_type) do nothing;

insert into public.webinar_commission_settings (commission_percent, is_active)
select 12.00, true
where not exists (select 1 from public.webinar_commission_settings);
