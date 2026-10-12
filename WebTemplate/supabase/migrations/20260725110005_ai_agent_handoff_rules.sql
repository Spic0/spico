-- Human handoff configuration — stored only. Nothing in this migration or
-- any code that reads it contacts Telnyx, a phone system, or a human.

create table public.ai_agent_handoff_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade unique,
  handoff_enabled boolean not null default true,
  primary_department_id uuid references public.departments (id) on delete set null,
  primary_phone_placeholder text,
  backup_phone_placeholder text,
  condition_guest_requests_human boolean not null default true,
  condition_low_confidence boolean not null default true,
  condition_unsupported_language boolean not null default true,
  condition_emergency boolean not null default true,
  condition_outside_hours boolean not null default true,
  condition_capability_disabled boolean not null default true,
  condition_high_risk boolean not null default true,
  handoff_message text,
  fallback_when_unavailable text not null default 'create_message_request' check (
    fallback_when_unavailable in ('create_message_request', 'fallback_message', 'keep_trying_backup')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_agent_handoff_rules is 'Stored configuration only, for later voice/messaging milestones. Phone numbers are placeholders — no dialing capability exists.';

create index ai_agent_handoff_rules_hotel_idx on public.ai_agent_handoff_rules (hotel_id);

create trigger trg_ai_agent_handoff_rules_set_scope
  before insert on public.ai_agent_handoff_rules
  for each row execute function public.set_ai_agent_child_scope();

create trigger trg_ai_agent_handoff_rules_set_updated_at
  before update on public.ai_agent_handoff_rules
  for each row execute function public.set_updated_at();

alter table public.ai_agent_handoff_rules enable row level security;

create policy "ai_agent_handoff_rules_select_permission"
  on public.ai_agent_handoff_rules for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_handoff_rules_insert_permission"
  on public.ai_agent_handoff_rules for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_handoff', hotel_id, organization_id));

create policy "ai_agent_handoff_rules_update_permission"
  on public.ai_agent_handoff_rules for update
  using (public.has_permission(auth.uid(), 'ai_agents.manage_handoff', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_handoff', hotel_id, organization_id));
