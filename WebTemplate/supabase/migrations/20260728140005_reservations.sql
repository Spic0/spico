-- Reservations. A booking is for a room TYPE for a date range; a specific room
-- is assigned (room_id) at or before check-in. Availability is computed at
-- booking/assignment time from rooms minus overlapping reservations — there is
-- no stored per-night inventory and (deliberately, for this foundation) no DB
-- exclusion constraint preventing an overlapping room assignment; the check-in
-- server action verifies the room is free. See docs/erd.md.

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  confirmation_code text not null,
  guest_id uuid not null references public.guests (id) on delete restrict,
  room_type_id uuid not null references public.room_types (id) on delete restrict,
  room_id uuid references public.rooms (id) on delete set null,
  rate_plan_id uuid references public.rate_plans (id) on delete set null,
  check_in_date date not null,
  check_out_date date not null,
  adults smallint not null default 1 check (adults between 1 and 20),
  children smallint not null default 0 check (children between 0 and 20),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  source text not null default 'direct',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, confirmation_code),
  constraint reservations_dates_valid check (check_out_date > check_in_date)
);

comment on table public.reservations is 'Bookings. room_id is assigned at/before check-in. Availability + assignment conflicts are app-enforced (no per-night inventory table, no exclusion constraint) in M6.';

create index reservations_hotel_idx on public.reservations (hotel_id);
create index reservations_status_idx on public.reservations (hotel_id, status);
create index reservations_dates_idx on public.reservations (hotel_id, check_in_date, check_out_date);
create index reservations_guest_idx on public.reservations (guest_id);
create index reservations_room_type_idx on public.reservations (room_type_id);
create index reservations_room_idx on public.reservations (room_id);

create trigger trg_reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

alter table public.reservations enable row level security;

create policy "reservations_select_permission"
  on public.reservations for select
  using (public.has_permission(auth.uid(), 'reservations.read', hotel_id, organization_id));

create policy "reservations_insert_permission"
  on public.reservations for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'reservations.manage', hotel_id, organization_id));

create policy "reservations_update_permission"
  on public.reservations for update
  using (public.has_permission(auth.uid(), 'reservations.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'reservations.manage', hotel_id, organization_id));
