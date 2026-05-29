-- Refresh the default admin commission settings away from the legacy 12% seed.
-- Existing non-legacy custom values are preserved.

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'organization_type'
  ) then
    alter type public.organization_type add value if not exists 'educator_coach';
  end if;
end $$;

insert into public.entity_commissions (entity_type, commission_percent, is_active)
values
  ('Coaching Institute', 50.00, true),
  ('Academy', 50.00, true),
  ('College', 50.00, true),
  ('University', 70.00, true),
  ('Skill Center', 50.00, true),
  ('Training Institute', 50.00, true),
  ('educator_coach', 50.00, true)
on conflict (entity_type) do update
set
  commission_percent = case
    when entity_commissions.commission_percent = 12.00 then excluded.commission_percent
    else entity_commissions.commission_percent
  end,
  is_active = true;

insert into public.webinar_commission_settings (commission_percent, is_active)
select 25.00, true
where not exists (select 1 from public.webinar_commission_settings);

update public.webinar_commission_settings
set commission_percent = 25.00,
    is_active = true
where commission_percent = 12.00;
