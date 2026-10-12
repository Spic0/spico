-- Reservations & PMS (Milestone 6). Room types, rooms, rate plans, guests, and
-- reservations with RLS + an operational UI. Availability is COMPUTED from
-- rooms minus overlapping reservations (no stored per-night inventory table in
-- this foundation). No channel-manager sync, folio/billing, or payment
-- processing exists yet — those are later milestones. See docs/erd.md.

-- A category of room (Standard, Deluxe, Suite, ...). base_rate is the default
-- nightly price; specific rate plans (20260728140003) can override it.
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  max_occupancy smallint not null default 2 check (max_occupancy between 1 and 20),
  base_rate numeric(12, 2) not null default 0 check (base_rate >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, code)
);

comment on table public.room_types is 'Room categories per hotel. base_rate is the default nightly price; availability is computed from rooms, not stored here.';

create index room_types_hotel_idx on public.room_types (hotel_id);

create trigger trg_room_types_set_updated_at
  before update on public.room_types
  for each row execute function public.set_updated_at();

alter table public.room_types enable row level security;

create policy "room_types_select_permission"
  on public.room_types for select
  using (public.has_permission(auth.uid(), 'pms.read', hotel_id, organization_id));

create policy "room_types_insert_permission"
  on public.room_types for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));

create policy "room_types_update_permission"
  on public.room_types for update
  using (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));
