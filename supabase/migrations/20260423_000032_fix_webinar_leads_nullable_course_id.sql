-- Webinar leads require course_id to be nullable.
-- Some environments still have a NOT NULL course_id from legacy course-only leads schema.

alter table if exists public.leads
  alter column course_id drop not null;

-- Re-assert mixed-target integrity using lead_type as source of truth.
alter table if exists public.leads
  drop constraint if exists leads_course_or_webinar_required_check;

alter table if exists public.leads
  add constraint leads_course_or_webinar_required_check
  check (
    (lead_type = 'course' and course_id is not null and webinar_id is null)
    or
    (lead_type = 'webinar' and webinar_id is not null and course_id is null)
  );
