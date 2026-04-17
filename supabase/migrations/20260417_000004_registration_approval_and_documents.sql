create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists phone text,
  add column if not exists alternate_phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists postal_code text,
  add column if not exists organization_name text,
  add column if not exists organization_type text,
  add column if not exists designation text;

update public.profiles
set approval_status = 'approved'
where approval_status is null;

alter table public.institutes
  add column if not exists institute_type text,
  add column if not exists legal_name text,
  add column if not exists registration_number text,
  add column if not exists accreditation_number text,
  add column if not exists website_url text,
  add column if not exists established_year int,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists postal_code text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists authorized_person_name text,
  add column if not exists authorized_person_designation text,
  add column if not exists student_strength int,
  add column if not exists staff_strength int,
  add column if not exists metadata jsonb;

create table if not exists public.user_verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'institute', 'admin')),
  document_category text not null check (document_category in ('identity', 'organization_approval', 'admin_authorization')),
  document_type text not null,
  document_url text not null,
  storage_path text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_verification_documents_user_id on public.user_verification_documents(user_id);
create index if not exists idx_profiles_approval_status on public.profiles(approval_status);
