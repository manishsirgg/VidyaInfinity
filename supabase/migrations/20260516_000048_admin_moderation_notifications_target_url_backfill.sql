-- Backfill missing target_url for legacy admin moderation notifications.
-- Idempotent: updates only admin recipients, moderation category, and null/blank target_url rows.
update public.notifications n
set target_url = case
  when n.title ilike 'Course moderation%' or n.title ilike '%syllabus%' or n.message ilike '%syllabus%' then '/admin/courses'
  when n.title ilike 'Institute moderation%' or n.title ilike '%institute%' or n.message ilike '%institute%' then '/admin/institutes'
  when n.title ilike '%update%' or n.message ilike '%update%' then '/admin/updates'
  when n.title ilike '%webinar%' or n.message ilike '%webinar%' then '/admin/webinars'
  else n.target_url
end
from public.profiles p
where p.id = n.user_id
  and p.role = 'admin'
  and n.category = 'moderation'
  and coalesce(n.target_url, '') = ''
  and (
    n.title ilike 'Course moderation%'
    or n.title ilike '%syllabus%'
    or n.title ilike 'Institute moderation%'
    or n.title ilike '%institute%'
    or n.title ilike '%update%'
    or n.title ilike '%webinar%'
    or n.message ilike '%moderation%'
    or n.message ilike '%pending%'
  );
