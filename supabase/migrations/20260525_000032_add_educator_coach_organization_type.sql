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
