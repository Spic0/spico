-- Memberships: join a profile to an organization (and optionally a specific
-- hotel) with a role. hotel_id is nullable because some roles are naturally
-- org-wide (Hotel Owner across properties) while others are always
-- hotel-scoped (Receptionist, Reception Manager). See docs/erd.md.
-- RLS policies are added in 20260723090009_policies.sql.

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid references public.hotels (id) on delete cascade,
  role_key text not null references public.roles (key),
  status text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  created_at timestamptz not null default now(),
  constraint memberships_hotel_belongs_to_org check (hotel_id is null or organization_id is not null)
);

comment on table public.memberships is 'Grants a profile a role within an organization or a specific hotel within it.';

create unique index memberships_unique_scope
  on public.memberships (profile_id, organization_id, hotel_id, role_key);

create index memberships_profile_idx on public.memberships (profile_id);
create index memberships_org_idx on public.memberships (organization_id);
create index memberships_hotel_idx on public.memberships (hotel_id);

alter table public.memberships enable row level security;
