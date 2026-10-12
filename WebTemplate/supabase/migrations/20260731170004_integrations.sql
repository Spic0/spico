-- External connector foundation (PMS/CRM/calendar/channel-manager). Same
-- "provider is always stub" pattern as M5's channels and M8's calls — no live
-- vendor connection, OAuth flow, or data sync exists anywhere in this schema
-- or the code that reads it. config is a free-form placeholder for whatever a
-- real connector will eventually need (API base URL, external account id) —
-- nothing reads it yet.

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  integration_type text not null check (integration_type in ('pms', 'crm', 'calendar', 'channel_manager')),
  name text not null,
  provider text not null default 'stub',
  status text not null default 'not_connected' check (status in ('not_connected', 'configured')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, name)
);

comment on table public.integrations is 'External connector foundation — provider is always ''stub'', no live PMS/CRM/calendar/channel-manager connection exists. See docs/roadmap.md (M9).';

create index integrations_hotel_idx on public.integrations (hotel_id);
create index integrations_type_idx on public.integrations (hotel_id, integration_type);

create trigger trg_integrations_set_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;

create policy "integrations_select_permission"
  on public.integrations for select
  using (public.has_permission(auth.uid(), 'integrations.read', hotel_id, organization_id));

create policy "integrations_insert_permission"
  on public.integrations for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'integrations.manage', hotel_id, organization_id));

create policy "integrations_update_permission"
  on public.integrations for update
  using (public.has_permission(auth.uid(), 'integrations.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'integrations.manage', hotel_id, organization_id));

create policy "integrations_delete_permission"
  on public.integrations for delete
  using (public.has_permission(auth.uid(), 'integrations.manage', hotel_id, organization_id));
