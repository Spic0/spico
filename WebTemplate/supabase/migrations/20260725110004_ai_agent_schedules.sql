-- Per-agent schedule override rows — only meaningful when the agent's
-- ai_agents.use_hotel_business_hours is false. Directly mirrors
-- hotel_business_hours (see docs/erd.md M2 notes for the same day/shift
-- conventions and limitations, e.g. no overnight-spanning hours yet).

create table public.ai_agent_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  shift_index smallint not null default 1 check (shift_index >= 1),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, day_of_week, shift_index),
  constraint ai_agent_schedules_times_consistent check (
    is_closed
    or (open_time is not null and close_time is not null and open_time < close_time)
  )
);

comment on table public.ai_agent_schedules is 'Override schedule, used only when the agent opts out of the hotel''s default business hours.';

create index ai_agent_schedules_agent_idx on public.ai_agent_schedules (agent_id);
create index ai_agent_schedules_hotel_idx on public.ai_agent_schedules (hotel_id);

create trigger trg_ai_agent_schedules_set_scope
  before insert on public.ai_agent_schedules
  for each row execute function public.set_ai_agent_child_scope();

create trigger trg_ai_agent_schedules_set_updated_at
  before update on public.ai_agent_schedules
  for each row execute function public.set_updated_at();

alter table public.ai_agent_schedules enable row level security;

create policy "ai_agent_schedules_select_permission"
  on public.ai_agent_schedules for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_schedules_insert_permission"
  on public.ai_agent_schedules for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_schedules', hotel_id, organization_id));

create policy "ai_agent_schedules_update_permission"
  on public.ai_agent_schedules for update
  using (public.has_permission(auth.uid(), 'ai_agents.manage_schedules', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_schedules', hotel_id, organization_id));

create policy "ai_agent_schedules_delete_permission"
  on public.ai_agent_schedules for delete
  using (public.has_permission(auth.uid(), 'ai_agents.manage_schedules', hotel_id, organization_id));
