-- Hotels: properties belonging to an organization.
-- RLS policies are added in 20260723090009_policies.sql.

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  timezone text not null default 'UTC',
  status text not null default 'onboarding' check (status in ('active', 'onboarding', 'suspended')),
  languages jsonb not null default '["en"]'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint hotels_languages_is_array_of_at_most_10 check (
    jsonb_typeof(languages) = 'array' and jsonb_array_length(languages) <= 10
  )
);

comment on table public.hotels is 'A property belonging to an organization. languages holds up to 10 configured language codes (jsonb for now, see docs/assumptions.md).';

alter table public.hotels enable row level security;
