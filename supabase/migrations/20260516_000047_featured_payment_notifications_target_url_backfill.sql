-- Backfill missing target_url for legacy featured course/webinar payment notifications.
-- Idempotent: updates only rows where target_url is null/blank.

update public.notifications n
set target_url = case
  when p.role = 'admin' then '/admin/featured-reconciliation'
  when p.role = 'institute' then '/institute/dashboard'
  else n.target_url
end
from public.profiles p
where p.id = n.user_id
  and p.role in ('admin', 'institute')
  and coalesce(n.target_url, '') = ''
  and n.category = 'payment'
  and n.type = 'payment'
  and (
    n.title ilike 'Course featuring payment initiated%'
    or n.title ilike 'Course featuring activated%'
    or n.title ilike 'Course featuring scheduled%'
    or n.title ilike 'Webinar promotion payment initiated%'
    or n.title ilike 'Webinar promotion activated%'
    or n.title ilike 'Webinar promotion scheduled%'
    or n.message ilike '%featured listing%'
    or n.message ilike '%featured webinar%'
    or n.message ilike '%featured promotion%'
  );
