create table if not exists public.student_saved_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create table if not exists public.student_cart_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create index if not exists idx_student_saved_courses_student on public.student_saved_courses(student_id, created_at desc);
create index if not exists idx_student_cart_items_student on public.student_cart_items(student_id, created_at desc);

alter table public.student_saved_courses enable row level security;
alter table public.student_cart_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_courses' and policyname = 'student_saved_courses_select_own'
  ) then
    create policy student_saved_courses_select_own
      on public.student_saved_courses
      for select
      using (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_courses' and policyname = 'student_saved_courses_insert_own'
  ) then
    create policy student_saved_courses_insert_own
      on public.student_saved_courses
      for insert
      with check (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_saved_courses' and policyname = 'student_saved_courses_delete_own'
  ) then
    create policy student_saved_courses_delete_own
      on public.student_saved_courses
      for delete
      using (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_cart_items' and policyname = 'student_cart_items_select_own'
  ) then
    create policy student_cart_items_select_own
      on public.student_cart_items
      for select
      using (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_cart_items' and policyname = 'student_cart_items_insert_own'
  ) then
    create policy student_cart_items_insert_own
      on public.student_cart_items
      for insert
      with check (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'student_cart_items' and policyname = 'student_cart_items_delete_own'
  ) then
    create policy student_cart_items_delete_own
      on public.student_cart_items
      for delete
      using (auth.uid() = student_id);
  end if;
end $$;
