-- Pending invitations to join an organization/hotel with a given role.
-- RLS policies are added in 20260723090009_policies.sql.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid references public.hotels (id) on delete cascade,
  email text not null,
  role_key text not null references public.roles (key),
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (token)
);

comment on table public.invitations is 'Pending invite for an email to join an org/hotel with a role. Accepted via a server action that creates the membership row.';

create index invitations_org_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);

alter table public.invitations enable row level security;
