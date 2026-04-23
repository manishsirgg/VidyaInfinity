alter table public.webinar_registrations enable row level security;

drop policy if exists webinar_registrations_select_student_own on public.webinar_registrations;
create policy webinar_registrations_select_student_own
  on public.webinar_registrations
  for select
  to authenticated
  using (auth.uid() = student_id);

drop policy if exists webinar_registrations_select_institute_own on public.webinar_registrations;
create policy webinar_registrations_select_institute_own
  on public.webinar_registrations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.institutes i
      where i.id = webinar_registrations.institute_id
        and i.user_id = auth.uid()
    )
  );
