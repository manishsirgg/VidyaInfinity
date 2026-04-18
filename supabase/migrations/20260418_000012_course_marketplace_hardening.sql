alter table public.courses
  add column if not exists status text,
  add column if not exists mode text,
  add column if not exists fees numeric(12,2),
  add column if not exists duration text,
  add column if not exists subject text,
  add column if not exists level text,
  add column if not exists schedule text,
  add column if not exists certificate_status text,
  add column if not exists certificate_details text,
  add column if not exists batch_size int,
  add column if not exists placement_support boolean,
  add column if not exists internship_support boolean,
  add column if not exists faculty_name text,
  add column if not exists faculty_qualification text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.courses
  add column if not exists rejection_reason text;

update public.courses
set
  status = coalesce(status, approval_status),
  mode = coalesce(mode, delivery_mode),
  fees = coalesce(fees, fee_amount),
  duration = coalesce(duration, concat_ws(' ', duration_value::text, duration_unit)),
  subject = coalesce(subject, subcategory),
  level = coalesce(level, course_level),
  schedule = coalesce(schedule, weekly_schedule),
  certificate_status = coalesce(certificate_status, case when certificate_available then 'available' else 'not_available' end),
  certificate_details = coalesce(certificate_details, certification_details),
  batch_size = coalesce(batch_size, total_seats),
  faculty_name = coalesce(faculty_name, instructor_name),
  faculty_qualification = coalesce(faculty_qualification, instructor_qualification),
  updated_at = now();

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
before update on public.courses
for each row
execute function public.set_timestamp_updated_at();

alter table public.course_media
  add column if not exists storage_path text;

create unique index if not exists idx_course_enrollments_user_course_unique
  on public.course_enrollments (user_id, course_id);

create unique index if not exists idx_razorpay_transactions_payment_id_unique
  on public.razorpay_transactions (razorpay_payment_id)
  where razorpay_payment_id is not null;
