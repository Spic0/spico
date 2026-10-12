-- Omnichannel Inbox skeleton (Milestone 5). Channels, conversations, and
-- messages with RLS. Provider integrations are stubbed behind a code-level
-- adapter interface (lib/inboxChannels.ts) — there is NO live email/SMS/
-- WhatsApp/Viber/voice connection anywhere in this schema or the code that
-- reads it. `provider = 'stub'` on every channel reflects that. See
-- docs/roadmap.md and docs/erd.md.

-- A configured communication channel for a hotel (a mailbox, a number, a web
-- chat widget, ...). Hotel-scoped and tenant-owned like departments.
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  channel_type text not null check (
    channel_type in ('email', 'sms', 'whatsapp', 'viber', 'web_chat', 'voice')
  ),
  name text not null,
  identifier text,
  provider text not null default 'stub',
  direction text not null default 'bidirectional' check (direction in ('inbound', 'outbound', 'bidirectional')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, name)
);

comment on table public.channels is 'Skeleton only: provider is always ''stub'' — no live messaging/voice provider is connected in M5.';

create index channels_hotel_idx on public.channels (hotel_id);

create trigger trg_channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

alter table public.channels enable row level security;

create policy "channels_select_permission"
  on public.channels for select
  using (public.has_permission(auth.uid(), 'inbox.view', hotel_id, organization_id));

create policy "channels_insert_permission"
  on public.channels for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'channels.manage', hotel_id, organization_id));

create policy "channels_update_permission"
  on public.channels for update
  using (public.has_permission(auth.uid(), 'channels.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'channels.manage', hotel_id, organization_id));
