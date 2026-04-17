create extension if not exists pgcrypto;

alter table public.institutes
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

alter table public.courses
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

alter table public.institute_documents
  add column if not exists storage_path text;

alter table public.course_media
  add column if not exists storage_path text;

alter table public.test_attempts
  add column if not exists score numeric(12,2),
  add column if not exists report_url text,
  add column if not exists report_storage_path text;

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_type text not null check (order_type in ('course', 'psychometric')),
  course_order_id uuid references public.course_orders(id) on delete set null,
  psychometric_order_id uuid references public.psychometric_orders(id) on delete set null,
  reason text not null,
  admin_note text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processed')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.psychometric_questions
  add column if not exists marks numeric(8,2) default 1,
  add column if not exists question_type text default 'single_choice';

alter table public.psychometric_question_options
  add column if not exists score numeric(8,2) default 0,
  add column if not exists sort_order int default 0,
  add column if not exists is_correct boolean default false;

alter table public.psychometric_answers
  add column if not exists score_awarded numeric(8,2) default 0,
  add column if not exists test_id uuid references public.psychometric_tests(id),
  add column if not exists option_id uuid references public.psychometric_question_options(id);
