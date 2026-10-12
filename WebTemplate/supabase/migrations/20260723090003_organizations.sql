-- Organizations: hotel groups / management companies. Top of the tenant tree.
-- RLS policies are added in 20260723090009_policies.sql, once every table
-- they reference (memberships in particular) exists.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'Hotel group / management company. Owns one or more hotels.';

alter table public.organizations enable row level security;
