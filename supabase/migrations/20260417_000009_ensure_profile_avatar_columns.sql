alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_storage_path text;
