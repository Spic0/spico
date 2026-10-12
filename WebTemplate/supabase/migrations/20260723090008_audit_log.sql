-- Append-only audit log. Every security-sensitive mutation and every
-- AI-triggered data change writes here (see lib/audit.ts). No update/delete
-- policies are ever added — the log is insert + select only.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'ai', 'system')),
  ai_session_id text,
  organization_id uuid references public.organizations (id) on delete set null,
  hotel_id uuid references public.hotels (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_actor_consistency check (
    (actor_type = 'user' and actor_profile_id is not null)
    or (actor_type in ('ai', 'system'))
  )
);

comment on table public.audit_log is 'Append-only. actor_type=ai entries are traceable via ai_session_id even though actor_profile_id may be null.';

create index audit_log_org_idx on public.audit_log (organization_id);
create index audit_log_hotel_idx on public.audit_log (hotel_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
