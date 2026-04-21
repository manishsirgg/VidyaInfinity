alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists priority text not null default 'normal',
  add column if not exists target_url text,
  add column if not exists action_label text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists dedupe_key text;

update public.notifications
set read_at = coalesce(read_at, created_at)
where is_read = true and read_at is null;

alter table public.notifications
  add constraint notifications_priority_check check (priority in ('low', 'normal', 'high', 'critical')) not valid;
alter table public.notifications validate constraint notifications_priority_check;

create index if not exists idx_notifications_feed_active
  on public.notifications(user_id, is_read, created_at desc)
  where dismissed_at is null and archived_at is null;

create index if not exists idx_notifications_entity_lookup
  on public.notifications(entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

create unique index if not exists idx_notifications_user_dedupe_key_unique
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;
