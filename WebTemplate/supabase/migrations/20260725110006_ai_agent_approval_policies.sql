-- Approval policy configuration for semi-automatic/automatic operating
-- modes. Storage only — no live approval queue exists yet (see
-- docs/roadmap.md); this shape is designed so that queue can be built
-- against it later without a schema change.

create table public.ai_agent_approval_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade unique,
  approver_roles jsonb not null default '["hotel_general_manager", "hotel_owner"]'::jsonb,
  approval_expiry_minutes integer not null default 60 check (approval_expiry_minutes > 0),
  default_fallback text not null default 'escalate_to_human' check (
    default_fallback in ('escalate_to_human', 'auto_deny', 'send_fallback_message')
  ),
  allow_automatic_low_risk_replies boolean not null default false,
  guest_visible_messages_require_approval boolean not null default true,
  reservation_requests_always_require_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_approval_policies_approver_roles_valid check (
    approver_roles <@ '["receptionist", "reception_manager", "reception_managers_manager", "hotel_general_manager", "hotel_owner"]'::jsonb
  )
);

comment on table public.ai_agent_approval_policies is 'Policy configuration only. No live approval queue reads this yet.';

create index ai_agent_approval_policies_hotel_idx on public.ai_agent_approval_policies (hotel_id);

create trigger trg_ai_agent_approval_policies_set_scope
  before insert on public.ai_agent_approval_policies
  for each row execute function public.set_ai_agent_child_scope();

create trigger trg_ai_agent_approval_policies_set_updated_at
  before update on public.ai_agent_approval_policies
  for each row execute function public.set_updated_at();

alter table public.ai_agent_approval_policies enable row level security;

create policy "ai_agent_approval_policies_select_permission"
  on public.ai_agent_approval_policies for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_approval_policies_insert_permission"
  on public.ai_agent_approval_policies for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_policies', hotel_id, organization_id));

create policy "ai_agent_approval_policies_update_permission"
  on public.ai_agent_approval_policies for update
  using (public.has_permission(auth.uid(), 'ai_agents.manage_policies', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_policies', hotel_id, organization_id));
