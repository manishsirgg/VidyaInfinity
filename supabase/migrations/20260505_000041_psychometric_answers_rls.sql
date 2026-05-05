alter table public.psychometric_answers enable row level security;

drop policy if exists "psychometric answers create own" on public.psychometric_answers;
drop policy if exists "psychometric answers delete own" on public.psychometric_answers;
drop policy if exists "psychometric answers read own/admin" on public.psychometric_answers;
drop policy if exists "psychometric answers update own" on public.psychometric_answers;

drop policy if exists psychometric_answers_select_own on public.psychometric_answers;
drop policy if exists psychometric_answers_insert_own on public.psychometric_answers;
drop policy if exists psychometric_answers_update_own on public.psychometric_answers;
drop policy if exists psychometric_answers_delete_admin on public.psychometric_answers;

create policy psychometric_answers_select_own
on public.psychometric_answers
for select
to authenticated
using (
  user_id = public.current_profile_id()
  or public.current_profile_is_admin()
);

create policy psychometric_answers_insert_own
on public.psychometric_answers
for insert
to authenticated
with check (
  (
    public.current_profile_role() = 'student'
    and user_id = public.current_profile_id()
  )
  or public.current_profile_is_admin()
);

create policy psychometric_answers_update_own
on public.psychometric_answers
for update
to authenticated
using (
  user_id = public.current_profile_id()
  or public.current_profile_is_admin()
)
with check (
  user_id = public.current_profile_id()
  or public.current_profile_is_admin()
);

create policy psychometric_answers_delete_admin
on public.psychometric_answers
for delete
to authenticated
using (
  public.current_profile_is_admin()
);
