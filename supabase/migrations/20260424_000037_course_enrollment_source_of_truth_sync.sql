-- Keep course_enrollments as the source of truth for access by syncing from course_orders transitions.

alter table public.course_enrollments
  add column if not exists cancelled_at timestamptz;

create or replace function public.resolve_course_enrollment_status(preferred text[], fallback text)
returns text
language plpgsql
as $$
declare
  resolved text;
begin
  if exists (
    select 1
    from pg_type t
    where t.typname = 'enrollment_status'
      and t.typnamespace = 'public'::regnamespace
  ) then
    select e.enumlabel
    into resolved
    from unnest(preferred) with ordinality as pref(label, ord)
    join pg_type t
      on t.typname = 'enrollment_status'
     and t.typnamespace = 'public'::regnamespace
    join pg_enum e
      on e.enumtypid = t.oid
     and e.enumlabel = pref.label
    order by pref.ord
    limit 1;

    return coalesce(resolved, fallback);
  end if;

  return coalesce(preferred[1], fallback);
end;
$$;

create or replace function public.sync_course_enrollment_from_order()
returns trigger
language plpgsql
as $$
declare
  v_student_id uuid;
  v_active_status text;
  v_revoked_status text;
  v_paid_at timestamptz;
  v_now timestamptz := now();
begin
  v_student_id := coalesce(new.student_id, new.user_id);
  if v_student_id is null or new.course_id is null or new.institute_id is null then
    return new;
  end if;

  v_paid_at := coalesce(new.paid_at, new.created_at, v_now);

  if new.payment_status = 'paid' then
    v_active_status := public.resolve_course_enrollment_status(array['enrolled', 'active'], 'enrolled');

    begin
      insert into public.course_enrollments (
        order_id,
        user_id,
        course_order_id,
        student_id,
        course_id,
        institute_id,
        enrollment_status,
        enrolled_at,
        access_start_at,
        metadata
      )
      values (
        new.id,
        v_student_id,
        new.id,
        v_student_id,
        new.course_id,
        new.institute_id,
        v_active_status,
        v_paid_at,
        v_paid_at,
        jsonb_build_object('source', 'db_trigger', 'synced_from', 'course_orders')
      )
      on conflict (course_order_id) do update
      set
        order_id = excluded.order_id,
        user_id = excluded.user_id,
        student_id = excluded.student_id,
        course_id = excluded.course_id,
        institute_id = excluded.institute_id,
        enrollment_status = excluded.enrollment_status,
        enrolled_at = excluded.enrolled_at,
        access_start_at = excluded.access_start_at,
        cancelled_at = null,
        access_end_at = null,
        metadata = coalesce(public.course_enrollments.metadata, '{}'::jsonb) || excluded.metadata;
    exception
      when unique_violation then
        update public.course_enrollments
        set
          order_id = new.id,
          user_id = v_student_id,
          course_order_id = new.id,
          institute_id = new.institute_id,
          enrollment_status = v_active_status,
          enrolled_at = coalesce(public.course_enrollments.enrolled_at, v_paid_at),
          access_start_at = coalesce(public.course_enrollments.access_start_at, v_paid_at),
          cancelled_at = null,
          access_end_at = null,
          metadata = coalesce(public.course_enrollments.metadata, '{}'::jsonb) || jsonb_build_object('source', 'db_trigger', 'synced_from', 'course_orders')
        where public.course_enrollments.student_id = v_student_id
          and public.course_enrollments.course_id = new.course_id
          and public.course_enrollments.enrollment_status in ('enrolled', 'active', 'pending', 'suspended', 'completed');
    end;
  elsif new.payment_status = 'refunded' then
    v_revoked_status := public.resolve_course_enrollment_status(array['cancelled', 'revoked', 'inactive'], 'cancelled');

    update public.course_enrollments
    set
      enrollment_status = v_revoked_status,
      cancelled_at = coalesce(public.course_enrollments.cancelled_at, v_now),
      access_end_at = coalesce(public.course_enrollments.access_end_at, v_now),
      metadata = coalesce(public.course_enrollments.metadata, '{}'::jsonb) || jsonb_build_object('source', 'db_trigger', 'synced_from', 'course_orders_refund')
    where (public.course_enrollments.course_order_id = new.id)
       or (
         public.course_enrollments.student_id = v_student_id
         and public.course_enrollments.course_id = new.course_id
         and public.course_enrollments.enrollment_status in ('enrolled', 'active', 'pending', 'suspended', 'completed')
       );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_course_enrollment_from_order on public.course_orders;
create trigger trg_sync_course_enrollment_from_order
after insert or update of payment_status, paid_at on public.course_orders
for each row
when (new.payment_status in ('paid', 'refunded'))
execute function public.sync_course_enrollment_from_order();

-- Backfill missing enrollments from already-paid course orders.
with paid_orders as (
  select
    o.id,
    coalesce(o.student_id, o.user_id) as student_id,
    o.course_id,
    o.institute_id,
    coalesce(o.paid_at, o.created_at, now()) as paid_at
  from public.course_orders o
  where o.payment_status = 'paid'
),
updated_existing as (
  update public.course_enrollments e
  set
    order_id = p.id,
    user_id = p.student_id,
    course_order_id = p.id,
    institute_id = p.institute_id,
    enrollment_status = public.resolve_course_enrollment_status(array['enrolled', 'active'], 'enrolled'),
    enrolled_at = coalesce(e.enrolled_at, p.paid_at),
    access_start_at = coalesce(e.access_start_at, p.paid_at),
    cancelled_at = null,
    access_end_at = null,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('source', 'migration_backfill', 'synced_from', 'course_orders')
  from paid_orders p
  where e.student_id = p.student_id
    and e.course_id = p.course_id
    and e.enrollment_status in ('enrolled', 'active', 'pending', 'suspended', 'completed')
  returning e.id, e.course_order_id
)
insert into public.course_enrollments (
  order_id,
  user_id,
  course_order_id,
  student_id,
  course_id,
  institute_id,
  enrollment_status,
  enrolled_at,
  access_start_at,
  metadata
)
select
  p.id,
  p.student_id,
  p.id,
  p.student_id,
  p.course_id,
  p.institute_id,
  public.resolve_course_enrollment_status(array['enrolled', 'active'], 'enrolled'),
  p.paid_at,
  p.paid_at,
  jsonb_build_object('source', 'migration_backfill', 'synced_from', 'course_orders')
from paid_orders p
where not exists (
  select 1
  from public.course_enrollments e
  where e.course_order_id = p.id
)
on conflict do nothing;

-- Backfill refunded orders so access rows are not left active.
with refunded_orders as (
  select
    o.id,
    coalesce(o.student_id, o.user_id) as student_id,
    o.course_id,
    coalesce(o.updated_at, now()) as refunded_at
  from public.course_orders o
  where o.payment_status = 'refunded'
)
update public.course_enrollments e
set
  enrollment_status = public.resolve_course_enrollment_status(array['cancelled', 'revoked', 'inactive'], 'cancelled'),
  cancelled_at = coalesce(e.cancelled_at, r.refunded_at),
  access_end_at = coalesce(e.access_end_at, r.refunded_at),
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('source', 'migration_backfill', 'synced_from', 'course_orders_refund')
from refunded_orders r
where e.course_order_id = r.id
   or (
     e.student_id = r.student_id
     and e.course_id = r.course_id
     and e.enrollment_status in ('enrolled', 'active', 'pending', 'suspended', 'completed')
   );
