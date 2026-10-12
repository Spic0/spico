-- AI Agent Configuration Foundation (Milestone 3). Configuration and policy
-- only — no voice/messaging/AI-provider connection exists anywhere in this
-- schema or the code that reads it. See docs/erd.md.

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  agent_type text not null check (
    agent_type in ('receptionist', 'reservations', 'concierge', 'night', 'restaurant', 'spa', 'general_information')
  ),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  operating_mode text not null default 'manual_assist' check (
    operating_mode in ('manual_assist', 'semi_automatic', 'automatic')
  ),
  default_language text not null,
  personality_tone text,
  greeting_message text,
  fallback_message text,
  handoff_message text,
  current_prompt_version integer not null default 1,
  knowledge_base_enabled boolean not null default false,
  test_mode_enabled boolean not null default true,
  use_hotel_business_hours boolean not null default true,
  holiday_behavior text not null default 'follow_hotel' check (
    holiday_behavior in ('follow_hotel', 'operate_normally', 'custom_rule')
  ),
  outside_hours_behavior text not null default 'transfer_reception' check (
    outside_hours_behavior in (
      'transfer_reception', 'transfer_oncall', 'create_message_request', 'fallback_message', 'disable_agent'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, name),
  unique (hotel_id, slug)
);

comment on table public.ai_agents is 'Configuration and policy only — no voice/AI/messaging connection exists yet. See docs/roadmap.md.';

create index ai_agents_hotel_idx on public.ai_agents (hotel_id);
create index ai_agents_org_idx on public.ai_agents (organization_id);
create index ai_agents_status_idx on public.ai_agents (status);

create trigger trg_ai_agents_set_updated_at
  before update on public.ai_agents
  for each row execute function public.set_updated_at();

alter table public.ai_agents enable row level security;

create policy "ai_agents_select_permission"
  on public.ai_agents for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agents_insert_permission"
  on public.ai_agents for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.create', hotel_id, organization_id));

-- Status transitions (activate/deactivate/archive) share this table with
-- general field edits, so RLS admits any of the three related permissions;
-- the specific server action for each (see lib/authz.ts callers) checks the
-- precise permission it actually needs before calling update() at all.
create policy "ai_agents_update_permission"
  on public.ai_agents for update
  using (
    public.has_permission(auth.uid(), 'ai_agents.update', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.activate', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.archive', hotel_id, organization_id)
  )
  with check (
    public.has_permission(auth.uid(), 'ai_agents.update', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.activate', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.archive', hotel_id, organization_id)
  );
