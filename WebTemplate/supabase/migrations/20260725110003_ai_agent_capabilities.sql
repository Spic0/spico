-- Per-agent capability configuration. Capability *definitions* (display name,
-- description, default risk level, default approval requirement, future
-- tool identifier) live in code (lib/agentCapabilities.ts) — this table only
-- stores what varies per agent. The CHECK list below must be kept in sync
-- with that registry's keys.

create table public.ai_agent_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  capability_key text not null check (
    capability_key in (
      'general_hotel_information', 'hotel_policies', 'check_in_out_information',
      'parking_information', 'breakfast_information', 'restaurant_information',
      'spa_information', 'transfer_information', 'location_and_directions',
      'availability_inquiry', 'booking_request_creation', 'reservation_lookup_request',
      'reservation_modification_request', 'reservation_cancellation_request',
      'reception_task_creation', 'guest_note_creation', 'human_handoff',
      'conversation_summary', 'emergency_escalation'
    )
  ),
  enabled boolean not null default false,
  -- null = inherit the registry's default approval requirement for this key.
  approval_required boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, capability_key),
  constraint ai_agent_capabilities_protected_always_enabled check (
    capability_key not in ('human_handoff', 'emergency_escalation') or enabled = true
  )
);

comment on table public.ai_agent_capabilities is 'Configuration only in M3 — enabling a capability here does not execute anything. human_handoff/emergency_escalation can never be disabled.';

create index ai_agent_capabilities_agent_idx on public.ai_agent_capabilities (agent_id);
create index ai_agent_capabilities_hotel_idx on public.ai_agent_capabilities (hotel_id);

create trigger trg_ai_agent_capabilities_set_scope
  before insert on public.ai_agent_capabilities
  for each row execute function public.set_ai_agent_child_scope();

create trigger trg_ai_agent_capabilities_set_updated_at
  before update on public.ai_agent_capabilities
  for each row execute function public.set_updated_at();

alter table public.ai_agent_capabilities enable row level security;

create policy "ai_agent_capabilities_select_permission"
  on public.ai_agent_capabilities for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_capabilities_insert_permission"
  on public.ai_agent_capabilities for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_capabilities', hotel_id, organization_id));

create policy "ai_agent_capabilities_update_permission"
  on public.ai_agent_capabilities for update
  using (public.has_permission(auth.uid(), 'ai_agents.manage_capabilities', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_capabilities', hotel_id, organization_id));
