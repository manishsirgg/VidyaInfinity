-- Ensure webinar commission has exactly one logical settings row.
with ranked as (
  select id,
         row_number() over (order by updated_at desc, created_at desc, id desc) as rn
  from public.webinar_commission_settings
)
delete from public.webinar_commission_settings w
using ranked r
where w.id = r.id
  and r.rn > 1;

create unique index if not exists webinar_commission_settings_singleton_idx
  on public.webinar_commission_settings ((true));
