do $$
declare
  target_email constant text := 'manishsirgg@gmail.com';
  admin_user_id uuid;
  admin_full_name text;
begin
  select u.id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), 'Default Admin')
    into admin_user_id, admin_full_name
  from auth.users u
  where lower(u.email) = lower(target_email)
  order by u.created_at asc
  limit 1;

  if admin_user_id is null then
    raise notice 'Default admin bootstrap skipped. No auth.users record found for %.', target_email;
    return;
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
   where id = admin_user_id;

  insert into public.profiles (id, email, full_name, role, approval_status, reviewed_at, rejection_reason)
  values (admin_user_id, target_email, admin_full_name, 'admin', 'approved', now(), null)
  on conflict (id)
  do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        role = 'admin',
        approval_status = 'approved',
        reviewed_at = now(),
        rejection_reason = null;
end $$;
