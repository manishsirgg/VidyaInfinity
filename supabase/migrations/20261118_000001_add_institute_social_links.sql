alter table public.institutes
  add column if not exists social_links jsonb;
