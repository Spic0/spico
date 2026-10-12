-- Append-only log of Test Playground runs. simulated_result is a computed
-- snapshot of configuration only — no row here is ever produced by an
-- actual AI, voice, or messaging call.

create table public.ai_agent_test_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  tested_by uuid references public.profiles (id) on delete set null,
  sample_message text not null,
  test_language text not null,
  simulated_result jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.ai_agent_test_sessions is 'Configuration Simulation only — no AI request or external action is ever executed to produce these rows.';

create index ai_agent_test_sessions_agent_idx on public.ai_agent_test_sessions (agent_id);
create index ai_agent_test_sessions_created_at_idx on public.ai_agent_test_sessions (created_at desc);

create trigger trg_ai_agent_test_sessions_set_scope
  before insert on public.ai_agent_test_sessions
  for each row execute function public.set_ai_agent_child_scope();

alter table public.ai_agent_test_sessions enable row level security;

create policy "ai_agent_test_sessions_select_permission"
  on public.ai_agent_test_sessions for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_test_sessions_insert_permission"
  on public.ai_agent_test_sessions for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.test', hotel_id, organization_id));
