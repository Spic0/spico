-- Shared helper for integrations child tables: derives organization_id/
-- hotel_id from the parent integration, same pattern as the other
-- set_*_child_scope() triggers (ai_agent/conversation/call/webhook/folio).
create or replace function public.set_integration_child_scope()
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
  from public.integrations where id = new.integration_id;

  if v_hotel_id is null then
    raise exception 'integrations.id % not found', new.integration_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Log of channel-manager sync attempts. Every row this milestone writes
-- comes from the "Sync now" stub action (lib/channelSync.ts) — it assembles
-- REAL current rates/availability/reservation data (genuinely queries the
-- live tables) but never transmits it anywhere; no OTA/channel-manager
-- credentials or HTTP call exist. summary holds what WOULD have been sent.
create table public.channel_manager_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  direction text not null check (direction in ('push_rates', 'push_availability', 'pull_reservations')),
  status text not null default 'success' check (status in ('success', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.channel_manager_sync_logs is 'Stub sync log — summary is real data that WOULD be sent, but nothing is ever transmitted to a live channel manager. See docs/roadmap.md (M11).';

create index channel_manager_sync_logs_integration_idx on public.channel_manager_sync_logs (integration_id, started_at desc);
create index channel_manager_sync_logs_hotel_idx on public.channel_manager_sync_logs (hotel_id);

create trigger trg_channel_manager_sync_logs_set_scope
  before insert on public.channel_manager_sync_logs
  for each row execute function public.set_integration_child_scope();

alter table public.channel_manager_sync_logs enable row level security;

create policy "channel_manager_sync_logs_select_permission"
  on public.channel_manager_sync_logs for select
  using (public.has_permission(auth.uid(), 'integrations.read', hotel_id, organization_id));

create policy "channel_manager_sync_logs_insert_permission"
  on public.channel_manager_sync_logs for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'integrations.manage', hotel_id, organization_id));
