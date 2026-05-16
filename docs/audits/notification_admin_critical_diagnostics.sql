select n.id, n.title, n.category, n.priority, n.target_url, n.dedupe_key, n.metadata, n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role = 'admin'
  and n.priority in ('critical', 'high')
  and n.category in ('payment_reconciliation', 'refund_reconciliation', 'featured_reconciliation', 'webhook_failure', 'system_guard')
order by n.created_at desc
limit 200;

select n.id, n.title, n.category, n.priority, n.target_url, n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role = 'admin'
  and n.priority in ('critical', 'high')
  and coalesce(n.target_url, '') = ''
order by n.created_at desc
limit 100;

select n.id, n.title, n.category, n.priority, n.dedupe_key, n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role = 'admin'
  and n.priority in ('critical', 'high')
  and coalesce(n.dedupe_key, '') = ''
order by n.created_at desc
limit 100;

select n.category, n.priority, count(*) as total
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role = 'admin'
  and n.created_at >= now() - interval '7 days'
  and n.priority in ('critical', 'high')
group by n.category, n.priority
order by total desc;

select user_id, dedupe_key, count(*) as duplicate_count
from public.notifications
where dedupe_key is not null
  and dedupe_key ilike 'admin:%'
group by user_id, dedupe_key
having count(*) > 1
order by duplicate_count desc;

select n.id, p.role, n.title, n.category, n.priority, n.dedupe_key, n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role <> 'admin'
  and n.priority in ('critical', 'high')
  and n.category in ('payment_reconciliation', 'refund_reconciliation', 'featured_reconciliation', 'webhook_failure', 'system_guard')
order by n.created_at desc
limit 100;
