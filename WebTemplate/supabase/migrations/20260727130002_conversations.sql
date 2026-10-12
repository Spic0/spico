-- A guest conversation thread on a channel. The assignee/department/agent
-- fields are configuration for who handles it; no routing engine acts on them
-- yet (that arrives with the voice/messaging milestones).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  subject text,
  guest_display_name text,
  guest_identifier text,
  status text not null default 'open' check (status in ('open', 'pending', 'snoozed', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assignee_membership_id uuid references public.memberships (id) on delete set null,
  assigned_department_id uuid references public.departments (id) on delete set null,
  ai_agent_id uuid references public.ai_agents (id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.conversations is 'Inbox thread. assignee/department/agent are handling metadata — no live routing/delivery engine consumes them in M5.';

create index conversations_hotel_idx on public.conversations (hotel_id);
create index conversations_channel_idx on public.conversations (channel_id);
create index conversations_status_idx on public.conversations (status);
create index conversations_assignee_idx on public.conversations (assignee_membership_id);
create index conversations_last_message_idx on public.conversations (hotel_id, last_message_at desc);

create trigger trg_conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "conversations_select_permission"
  on public.conversations for select
  using (public.has_permission(auth.uid(), 'inbox.view', hotel_id, organization_id));

-- Compose a new thread requires inbox.send; assignment/status changes require
-- inbox.manage. Both write the same row, so the UPDATE policy admits either and
-- the specific server action checks the precise permission before writing
-- (same pattern as ai_agents' multi-permission UPDATE policy in M3).
create policy "conversations_insert_permission"
  on public.conversations for insert
  to authenticated
  with check (
    public.has_permission(auth.uid(), 'inbox.send', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'inbox.manage', hotel_id, organization_id)
  );

create policy "conversations_update_permission"
  on public.conversations for update
  using (
    public.has_permission(auth.uid(), 'inbox.send', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'inbox.manage', hotel_id, organization_id)
  )
  with check (
    public.has_permission(auth.uid(), 'inbox.send', hotel_id, organization_id)
    or public.has_permission(auth.uid(), 'inbox.manage', hotel_id, organization_id)
  );
