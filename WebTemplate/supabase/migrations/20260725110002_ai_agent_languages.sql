-- Shared helper reused by every ai_agent_* child table: derives
-- organization_id/hotel_id from the parent agent so callers never supply
-- (or can mismatch) tenant scope directly. Same pattern as M2's
-- set_membership_department_scope().
create or replace function public.set_ai_agent_child_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_org_id uuid;
begin
  select hotel_id, organization_id into v_hotel_id, v_org_id
  from public.ai_agents where id = new.agent_id;

  if v_hotel_id is null then
    raise exception 'ai_agents.id % not found', new.agent_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Per-agent language enablement. language_code values are validated against
-- the hotel's own `hotels.languages` in the server action (cross-table,
-- app-enforced — see docs/assumptions.md), not by a DB constraint.
create table public.ai_agent_languages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  language_code text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  localized_greeting text,
  localized_fallback text,
  voice_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, language_code),
  constraint ai_agent_languages_default_must_be_enabled check (not is_default or enabled)
);

comment on table public.ai_agent_languages is 'Which of the hotel''s guest languages this agent uses. voice_preference is a placeholder for a future voice provider — not consumed anywhere yet.';

create unique index ai_agent_languages_one_default
  on public.ai_agent_languages (agent_id)
  where (is_default);

create index ai_agent_languages_agent_idx on public.ai_agent_languages (agent_id);
create index ai_agent_languages_hotel_idx on public.ai_agent_languages (hotel_id);

create trigger trg_ai_agent_languages_set_scope
  before insert on public.ai_agent_languages
  for each row execute function public.set_ai_agent_child_scope();

create trigger trg_ai_agent_languages_set_updated_at
  before update on public.ai_agent_languages
  for each row execute function public.set_updated_at();

alter table public.ai_agent_languages enable row level security;

create policy "ai_agent_languages_select_permission"
  on public.ai_agent_languages for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "ai_agent_languages_insert_permission"
  on public.ai_agent_languages for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_languages', hotel_id, organization_id));

create policy "ai_agent_languages_update_permission"
  on public.ai_agent_languages for update
  using (public.has_permission(auth.uid(), 'ai_agents.manage_languages', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_languages', hotel_id, organization_id));

create policy "ai_agent_languages_delete_permission"
  on public.ai_agent_languages for delete
  using (public.has_permission(auth.uid(), 'ai_agents.manage_languages', hotel_id, organization_id));
