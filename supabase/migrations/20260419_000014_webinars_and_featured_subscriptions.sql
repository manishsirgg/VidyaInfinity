create table if not exists public.webinars (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  webinar_mode text not null default 'free' check (webinar_mode in ('free', 'paid')),
  price numeric(10,2) not null default 0,
  currency text not null default 'INR',
  meeting_url text,
  registration_url text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinars_paid_price_check check (
    (webinar_mode = 'free' and coalesce(price, 0) = 0) or
    (webinar_mode = 'paid' and coalesce(price, 0) > 0)
  )
);

create index if not exists webinars_institute_id_idx on public.webinars(institute_id);
create index if not exists webinars_starts_at_idx on public.webinars(starts_at);

create table if not exists public.institute_featured_subscriptions (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly')),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'INR',
  duration_days integer not null check (duration_days > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  lead_boost_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institute_featured_subscriptions_institute_id_idx
  on public.institute_featured_subscriptions(institute_id);

create index if not exists institute_featured_subscriptions_status_idx
  on public.institute_featured_subscriptions(status);
