create extension if not exists pgcrypto;

create table if not exists public.institute_media (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  file_url text not null,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_institute_media_institute_id on public.institute_media(institute_id);
