-- Split lead entity type from contact mode for leads.

alter table if exists public.leads
  add column if not exists lead_type text,
  add column if not exists contact_preference text;

update public.leads
set lead_type = case
  when lead_type in ('course', 'webinar') then lead_type
  when lead_target in ('course', 'webinar') then lead_target
  when webinar_id is not null then 'webinar'
  else 'course'
end
where lead_type is null or lead_type not in ('course', 'webinar');

update public.leads
set contact_preference = case
  when contact_preference in ('email', 'whatsapp', 'both') then contact_preference
  when lead_target in ('email', 'whatsapp', 'both') then lead_target
  when coalesce(metadata ->> 'contact_preference', '') in ('email', 'whatsapp', 'both') then metadata ->> 'contact_preference'
  else 'both'
end
where contact_preference is null or contact_preference not in ('email', 'whatsapp', 'both');

update public.leads
set lead_target = lead_type
where lead_target is distinct from lead_type;

alter table if exists public.leads
  alter column lead_type set default 'course',
  alter column lead_type set not null,
  alter column contact_preference set default 'both',
  alter column contact_preference set not null;

alter table if exists public.leads
  drop constraint if exists leads_lead_type_check;
alter table if exists public.leads
  add constraint leads_lead_type_check
  check (lead_type in ('course', 'webinar'));

alter table if exists public.leads
  drop constraint if exists leads_contact_preference_check;
alter table if exists public.leads
  add constraint leads_contact_preference_check
  check (contact_preference in ('email', 'whatsapp', 'both'));

alter table if exists public.leads
  drop constraint if exists leads_course_or_webinar_required_check;
alter table if exists public.leads
  add constraint leads_course_or_webinar_required_check
  check (
    (lead_type = 'course' and course_id is not null and webinar_id is null)
    or
    (lead_type = 'webinar' and webinar_id is not null and course_id is null)
  );

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert
on public.leads
for insert
to anon, authenticated
with check (
  lead_type in ('course', 'webinar')
  and contact_preference in ('email', 'whatsapp', 'both')
  and institute_id is not null
  and (
    (lead_type = 'course' and course_id is not null and webinar_id is null)
    or (lead_type = 'webinar' and webinar_id is not null and course_id is null)
  )
  and coalesce(length(trim(full_name)), 0) >= 2
);
