create table if not exists public.student_saved_webinars (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, webinar_id)
);

create index if not exists idx_student_saved_webinars_student on public.student_saved_webinars(student_id, created_at desc);

alter table public.student_saved_webinars enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_webinars' and policyname = 'student_saved_webinars_select_own'
  ) then
    create policy student_saved_webinars_select_own
      on public.student_saved_webinars
      for select
      using (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_webinars' and policyname = 'student_saved_webinars_insert_own'
  ) then
    create policy student_saved_webinars_insert_own
      on public.student_saved_webinars
      for insert
      with check (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_webinars' and policyname = 'student_saved_webinars_delete_own'
  ) then
    create policy student_saved_webinars_delete_own
      on public.student_saved_webinars
      for delete
      using (auth.uid() = student_id);
  end if;
end $$;
