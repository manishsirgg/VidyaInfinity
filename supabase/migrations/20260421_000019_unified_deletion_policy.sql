-- Unified deletion policy foundations (safe, additive)

alter table if exists public.admin_audit_logs
  add column if not exists actor_user_id uuid references auth.users(id),
  add column if not exists description text,
  add column if not exists old_data jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table if exists public.institutes
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.courses
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.webinars
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.blogs
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.crm_contacts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.crm_notes
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.crm_follow_ups
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.crm_leads
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

alter table if exists public.leads
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id);

create index if not exists idx_courses_not_deleted on public.courses (id) where is_deleted = false;
create index if not exists idx_webinars_not_deleted on public.webinars (id) where is_deleted = false;
create index if not exists idx_blogs_not_deleted on public.blogs (id) where is_deleted = false;
create index if not exists idx_crm_contacts_not_deleted on public.crm_contacts (id) where is_deleted = false;
create index if not exists idx_institutes_not_deleted on public.institutes (id) where is_deleted = false;
