-- Read-only notification integrity diagnostics

-- 1) Null / invalid user_id notifications
select n.id, n.user_id, n.created_at
from public.notifications n
left join public.profiles p on p.id = n.user_id
where n.user_id is null or p.id is null
order by n.created_at desc
limit 200;

-- 2) Duplicate dedupe_key per user
select user_id, dedupe_key, count(*) as duplicate_count, min(created_at) as first_seen, max(created_at) as last_seen
from public.notifications
where dedupe_key is not null and btrim(dedupe_key) <> ''
group by user_id, dedupe_key
having count(*) > 1
order by duplicate_count desc, last_seen desc;

-- 3) Unread counts by role
select p.role, count(*) as unread_count
from public.notifications n
join public.profiles p on p.id = n.user_id
where n.is_read = false
group by p.role
order by unread_count desc;

-- 4) Broken target_url rows
select id, user_id, type, category, target_url, created_at
from public.notifications
where coalesce(target_url, '') = ''
  and category in ('payment','refund','payout','psychometric','payment_reconciliation','webhook_failure','payout_failure')
order by created_at desc
limit 500;

-- 5) Expired but still active notifications
select id, user_id, category, expires_at, dismissed_at, archived_at
from public.notifications
where expires_at is not null and expires_at < now() and dismissed_at is null and archived_at is null
order by expires_at asc
limit 500;

-- 6) Recent critical admin notifications
select n.id, n.title, n.category, n.priority, n.target_url, n.metadata, n.created_at
from public.notifications n
join public.profiles p on p.id = n.user_id
where p.role = 'admin' and n.priority = 'critical'
order by n.created_at desc
limit 200;

-- 7) Volume by category (last 7 days)
select category, type, count(*) as total
from public.notifications
where created_at >= now() - interval '7 days'
group by category, type
order by total desc, category;
