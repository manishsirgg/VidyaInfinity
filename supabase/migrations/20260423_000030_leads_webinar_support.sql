-- Add webinar lead compatibility to leads schema and policies.

alter table if exists public.leads
  add column if not exists webinar_id uuid null;

alter table if exists public.leads
  add constraint leads_webinar_id_fkey
  foreign key (webinar_id) references public.webinars(id) on delete cascade;

create index if not exists idx_leads_webinar_id on public.leads (webinar_id);

alter table if exists public.leads
  drop constraint if exists leads_course_id_fkey;

alter table if exists public.leads
  drop constraint if exists leads_course_institute_fk;

alter table if exists public.leads
  add constraint leads_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete cascade;

alter table if exists public.leads
  add constraint leads_course_institute_fk
  foreign key (course_id, institute_id) references public.courses(id, institute_id) on delete restrict;

alter table if exists public.leads
  drop constraint if exists leads_course_or_webinar_required_check;

alter table if exists public.leads
  add constraint leads_course_or_webinar_required_check
  check (
    (lead_target = 'course' and course_id is not null and webinar_id is null)
    or
    (lead_target = 'webinar' and webinar_id is not null and course_id is null)
  );

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert
on public.leads
for insert
to anon, authenticated
with check (
  lead_target in ('course', 'webinar')
  and institute_id is not null
  and (
    (lead_target = 'course' and course_id is not null and webinar_id is null)
    or (lead_target = 'webinar' and webinar_id is not null and course_id is null)
  )
  and coalesce(length(trim(full_name)), 0) >= 2
);
