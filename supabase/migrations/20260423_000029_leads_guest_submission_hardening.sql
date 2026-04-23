-- Allow course lead submissions for guest and logged-in users without requiring student_id.

alter table if exists public.leads
  alter column student_id drop not null;

alter table if exists public.leads
  add column if not exists full_name text,
  add column if not exists lead_target text not null default 'course',
  add column if not exists source text not null default 'course_detail_page',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.leads
  alter column source set default 'course_detail_page',
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_lead_target_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_lead_target_check
      check (lead_target in ('course', 'webinar'));
  end if;
end $$;

update public.leads
set full_name = coalesce(nullif(full_name, ''), name)
where coalesce(nullif(full_name, ''), '') = '';

alter table if exists public.leads
  alter column full_name set not null;

alter table if exists public.leads
  enable row level security;

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert
on public.leads
for insert
to anon, authenticated
with check (
  lead_target in ('course', 'webinar')
  and course_id is not null
  and institute_id is not null
  and coalesce(length(trim(full_name)), 0) >= 2
);

-- Keep existing admin/institute/student read/update flows intact.
