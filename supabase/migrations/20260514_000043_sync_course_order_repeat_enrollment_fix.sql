-- Fix repeat course enrollment sync for unique student+course rows.
-- Replaces public.sync_course_order_to_course_enrollment() and keeps trigger compatibility.

create or replace function public.sync_course_order_to_course_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_access_start_at timestamptz;
  v_access_end_at timestamptz;
  v_duration_value integer;
  v_duration_unit text;
  v_now timestamptz := now();
  v_existing public.course_enrollments%rowtype;
  v_metadata_patch jsonb;
begin
  v_student_id := coalesce(new.student_id, new.user_id);
  if v_student_id is null or new.course_id is null or new.institute_id is null then
    return new;
  end if;

  if new.payment_status = 'paid' then
    v_access_start_at := coalesce(new.paid_at, v_now);

    select c.duration_value, c.duration_unit
      into v_duration_value, v_duration_unit
    from public.courses c
    where c.id = new.course_id;

    if v_duration_unit is null then
      v_access_end_at := null;
    elsif lower(v_duration_unit) in ('lifetime', 'forever', 'unlimited') then
      v_access_end_at := null;
    elsif v_duration_value is null or v_duration_value <= 0 then
      v_access_end_at := v_access_start_at + interval '180 days';
    elsif lower(v_duration_unit) in ('day', 'days') then
      v_access_end_at := v_access_start_at + make_interval(days => v_duration_value);
    elsif lower(v_duration_unit) in ('week', 'weeks') then
      v_access_end_at := v_access_start_at + make_interval(days => v_duration_value * 7);
    elsif lower(v_duration_unit) in ('month', 'months') then
      v_access_end_at := v_access_start_at + make_interval(months => v_duration_value);
    elsif lower(v_duration_unit) in ('year', 'years') then
      v_access_end_at := v_access_start_at + make_interval(years => v_duration_value);
    else
      v_access_end_at := v_access_start_at + interval '180 days';
    end if;

    v_metadata_patch := jsonb_build_object(
      'source', 'course_orders_trigger',
      'course_order_id', new.id,
      'razorpay_order_id', new.razorpay_order_id,
      'razorpay_payment_id', new.razorpay_payment_id
    );

    select e.*
      into v_existing
    from public.course_enrollments e
    where e.student_id = v_student_id
      and e.course_id = new.course_id
    limit 1;

    if not found then
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
        access_end_at,
        completed_at,
        cancelled_at,
        metadata,
        created_at,
        updated_at
      )
      values (
        new.id,
        v_student_id,
        new.id,
        v_student_id,
        new.course_id,
        new.institute_id,
        'active',
        v_access_start_at,
        v_access_start_at,
        v_access_end_at,
        null,
        null,
        v_metadata_patch,
        v_now,
        v_now
      );
      return new;
    end if;

    if (
      v_existing.enrollment_status in ('cancelled', 'completed', 'suspended')
      or (v_existing.access_end_at is not null and v_existing.access_end_at <= v_now)
    ) then
      update public.course_enrollments e
      set
        order_id = new.id,
        user_id = v_student_id,
        course_order_id = new.id,
        institute_id = new.institute_id,
        enrollment_status = 'active',
        enrolled_at = v_access_start_at,
        access_start_at = v_access_start_at,
        access_end_at = v_access_end_at,
        completed_at = null,
        cancelled_at = null,
        metadata = coalesce(e.metadata, '{}'::jsonb) || v_metadata_patch,
        updated_at = v_now
      where e.id = v_existing.id;

      return new;
    end if;

    if (
      v_existing.enrollment_status = 'active'
      and (v_existing.access_end_at is null or v_existing.access_end_at > v_now)
      and v_existing.course_order_id = new.id
    ) then
      return new;
    end if;

    if (
      v_existing.enrollment_status = 'active'
      and (v_existing.access_end_at is null or v_existing.access_end_at > v_now)
      and v_existing.course_order_id <> new.id
    ) then
      raise exception 'ACTIVE_ENROLLMENT_EXISTS_FOR_STUDENT_COURSE';
    end if;

    -- Any other state is normalized to a reactivation.
    update public.course_enrollments e
    set
      order_id = new.id,
      user_id = v_student_id,
      course_order_id = new.id,
      institute_id = new.institute_id,
      enrollment_status = 'active',
      enrolled_at = v_access_start_at,
      access_start_at = v_access_start_at,
      access_end_at = v_access_end_at,
      completed_at = null,
      cancelled_at = null,
      metadata = coalesce(e.metadata, '{}'::jsonb) || v_metadata_patch,
      updated_at = v_now
    where e.id = v_existing.id;

  elsif new.payment_status = 'refunded' then
    update public.course_enrollments e
    set
      enrollment_status = 'cancelled',
      cancelled_at = coalesce(e.cancelled_at, v_now),
      access_end_at = coalesce(e.access_end_at, v_now),
      updated_at = v_now,
      metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'course_orders_trigger_refund',
        'course_order_id', new.id,
        'razorpay_order_id', new.razorpay_order_id,
        'razorpay_payment_id', new.razorpay_payment_id
      )
    where e.course_order_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.sync_course_enrollment_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.sync_course_order_to_course_enrollment();
end;
$$;
