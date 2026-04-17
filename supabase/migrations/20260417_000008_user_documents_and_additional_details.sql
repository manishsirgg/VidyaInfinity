create extension if not exists pgcrypto;

create table if not exists public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_category text not null,
  document_type text not null,
  document_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_documents_user_id on public.user_documents(user_id);
create index if not exists idx_user_documents_status on public.user_documents(status);

create table if not exists public.user_additional_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  alternate_phone text,
  dob date,
  gender text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  legal_entity_name text,
  registration_number text,
  accreditation_affiliation_number text,
  website_url text,
  established_year integer,
  total_students integer,
  total_staff integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_user_additional_details_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_additional_details_updated_at on public.user_additional_details;
create trigger trg_user_additional_details_updated_at
before update on public.user_additional_details
for each row
execute function public.set_user_additional_details_updated_at();

do $$
begin
  if to_regclass('public.user_verification_documents') is not null then
    insert into public.user_documents (user_id, document_category, document_type, document_url, status, created_at)
    select
      user_id,
      case
        when document_category = 'admin_authorization' then 'authorization'
        else document_category
      end as document_category,
      document_type,
      document_url,
      case
        when verification_status = 'verified' then 'approved'
        when verification_status = 'rejected' then 'rejected'
        else 'pending'
      end as status,
      created_at
    from public.user_verification_documents
    on conflict do nothing;
  end if;
end $$;
