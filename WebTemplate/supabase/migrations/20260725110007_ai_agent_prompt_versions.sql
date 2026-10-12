-- Versioned, hotel-editable prompt content. Immutable and append-only —
-- editing always inserts a new row; "restoring" a prior version copies its
-- content into a new row rather than resurrecting the old one. The only
-- UPDATE ever performed is flipping is_active off the previously-active row.
-- Platform-protected safety rules are NOT here — they live in
-- lib/agentPromptPolicy.ts and are never hotel-editable.

create table public.ai_agent_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  purpose text,
  hotel_identity text,
  tone_of_voice text,
  greeting_style text,
  communication_rules text,
  language_behavior text,
  escalation_rules text,
  safety_rules text,
  policy_references text,
  additional_instructions text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (agent_id, version_number)
);

comment on table public.ai_agent_prompt_versions is 'Immutable, append-only. safety_rules holds the hotel''s additional notes only — the non-negotiable platform rules live in lib/agentPromptPolicy.ts, never here.';

create unique index ai_agent_prompt_versions_one_active
  on public.ai_agent_prompt_versions (agent_id)
  where (is_active);

create index ai_agent_prompt_versions_agent_idx on public.ai_agent_prompt_versions (agent_id);

create trigger trg_ai_agent_prompt_versions_set_scope
  before insert on public.ai_agent_prompt_versions
  for each row execute function public.set_ai_agent_child_scope();

alter table public.ai_agent_prompt_versions enable row level security;

create policy "ai_agent_prompt_versions_select_permission"
  on public.ai_agent_prompt_versions for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

-- Both editing (new version from changed fields) and restoring (new version
-- copying old content) insert a row here — the specific server action for
-- each checks the precise permission it needs before calling insert() at all.
create policy "ai_agent_prompt_versions_insert_permission"
  on public.ai_agent_prompt_versions for insert
  to authenticated
  with check (
    public.has_permission(auth.uid(), 'ai_agents.manage_prompts', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.restore_prompt_version', hotel_id, organization_id)
  );

-- Only ever used to flip is_active off the previously-active row.
create policy "ai_agent_prompt_versions_update_permission"
  on public.ai_agent_prompt_versions for update
  using (
    public.has_permission(auth.uid(), 'ai_agents.manage_prompts', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.restore_prompt_version', hotel_id, organization_id)
  )
  with check (
    public.has_permission(auth.uid(), 'ai_agents.manage_prompts', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'ai_agents.restore_prompt_version', hotel_id, organization_id)
  );
