-- Individual physical rooms. housekeeping_status is a light operational state;
-- a full housekeeping workflow (assignments, inspection) is a later milestone.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_type_id uuid not null references public.room_types (id) on delete restrict,
  room_number text not null,
  floor text,
  housekeeping_status text not null default 'clean'
    check (housekeeping_status in ('clean', 'dirty', 'inspected', 'out_of_service')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, room_number)
);

comment on table public.rooms is 'Physical rooms. out_of_service/inactive rooms are excluded from computed availability. FK to room_types is RESTRICT so a type in use cannot be deleted.';

create index rooms_hotel_idx on public.rooms (hotel_id);
create index rooms_type_idx on public.rooms (room_type_id);

create trigger trg_rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;

create policy "rooms_select_permission"
  on public.rooms for select
  using (public.has_permission(auth.uid(), 'pms.read', hotel_id, organization_id));

create policy "rooms_insert_permission"
  on public.rooms for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));

create policy "rooms_update_permission"
  on public.rooms for update
  using (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));
