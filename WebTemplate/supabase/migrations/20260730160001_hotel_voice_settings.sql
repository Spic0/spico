-- Voice: Telnyx + OpenAI Realtime (Milestone 8). Per-hotel voice configuration:
-- whether voice is enabled, the (placeholder, unverified) phone number, and
-- which AI agent handles inbound calls by default. This is the seam that
-- finally connects M3's agent configuration to a call path — see
-- voice-service/README.md for what actually runs the call (a separate
-- persistent Node.js service, not this Next.js app). No live Telnyx number is
-- provisioned by this table; phone_number is operator-entered text.

create table public.hotel_voice_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  enabled boolean not null default false,
  phone_number text,
  default_agent_id uuid references public.ai_agents (id) on delete set null,
  greeting_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id)
);

comment on table public.hotel_voice_settings is 'Per-hotel voice configuration. phone_number is operator-entered text, not a provisioned Telnyx number. default_agent_id is validated to belong to the same hotel in the server action (cross-table, app-enforced).';

create index hotel_voice_settings_hotel_idx on public.hotel_voice_settings (hotel_id);
create index hotel_voice_settings_agent_idx on public.hotel_voice_settings (default_agent_id);

create trigger trg_hotel_voice_settings_set_updated_at
  before update on public.hotel_voice_settings
  for each row execute function public.set_updated_at();

alter table public.hotel_voice_settings enable row level security;

create policy "hotel_voice_settings_select_permission"
  on public.hotel_voice_settings for select
  using (public.has_permission(auth.uid(), 'voice.manage', hotel_id, organization_id));

create policy "hotel_voice_settings_insert_permission"
  on public.hotel_voice_settings for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'voice.manage', hotel_id, organization_id));

create policy "hotel_voice_settings_update_permission"
  on public.hotel_voice_settings for update
  using (public.has_permission(auth.uid(), 'voice.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'voice.manage', hotel_id, organization_id));
