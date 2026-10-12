-- A call record. Written by the voice-service (service role, bypasses RLS) for
-- both real future calls and the "simulate inbound call" test path it exposes
-- while no live Telnyx/OpenAI credentials are configured — every row this
-- milestone writes comes from that simulate path, never a live PSTN call.
-- conversation_id is a foundation seam for a future call-as-conversation
-- integration with M5's inbox (channels.channel_type already includes
-- 'voice'); nothing populates it in M8.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  ai_agent_id uuid references public.ai_agents (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text,
  to_number text,
  provider text not null default 'stub',
  status text not null default 'completed'
    check (status in ('ringing', 'in_progress', 'completed', 'failed', 'no_answer')),
  disposition text
    check (disposition is null or disposition in ('handled_by_ai', 'handoff_required', 'handoff_completed', 'voicemail', 'missed')),
  handoff_reason text,
  notes text,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.calls is 'Call records. provider is always ''stub'' in M8 — every row comes from the voice-service simulate path, no live PSTN call exists. See voice-service/README.md.';

create index calls_hotel_idx on public.calls (hotel_id);
create index calls_status_idx on public.calls (hotel_id, status);
create index calls_disposition_idx on public.calls (hotel_id, disposition);
create index calls_agent_idx on public.calls (ai_agent_id);
create index calls_started_idx on public.calls (hotel_id, started_at desc);

create trigger trg_calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

alter table public.calls enable row level security;

create policy "calls_select_permission"
  on public.calls for select
  using (public.has_permission(auth.uid(), 'calls.read', hotel_id, organization_id));

-- Staff insert is a defense-in-depth policy for a possible future
-- "log an offline call" feature; the voice-service (service role) bypasses RLS
-- entirely and is the only writer today.
create policy "calls_insert_permission"
  on public.calls for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'calls.manage', hotel_id, organization_id));

create policy "calls_update_permission"
  on public.calls for update
  using (public.has_permission(auth.uid(), 'calls.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'calls.manage', hotel_id, organization_id));
