-- Public Booking Engine (Milestone 7). A hotel opts into public booking via
-- booking_settings. The guest-facing flow never touches base tables directly —
-- all public reads/writes go through SECURITY DEFINER functions
-- (20260729150002_booking_rpcs.sql) that return only derived, non-sensitive
-- data. This table itself is internal-only (managed via booking.manage); the
-- public RPCs read it as definer. See docs/erd.md.

create table public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  enabled boolean not null default false,
  min_nights smallint not null default 1 check (min_nights between 1 and 90),
  max_nights smallint not null default 30 check (max_nights between 1 and 365),
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id),
  constraint booking_settings_night_range check (max_nights >= min_nights)
);

comment on table public.booking_settings is 'Per-hotel public booking configuration. Internal-only table; the public engine reads it via SECURITY DEFINER RPCs.';

create index booking_settings_hotel_idx on public.booking_settings (hotel_id);

create trigger trg_booking_settings_set_updated_at
  before update on public.booking_settings
  for each row execute function public.set_updated_at();

alter table public.booking_settings enable row level security;

create policy "booking_settings_select_permission"
  on public.booking_settings for select
  using (public.has_permission(auth.uid(), 'booking.manage', hotel_id, organization_id));

create policy "booking_settings_insert_permission"
  on public.booking_settings for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'booking.manage', hotel_id, organization_id));

create policy "booking_settings_update_permission"
  on public.booking_settings for update
  using (public.has_permission(auth.uid(), 'booking.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'booking.manage', hotel_id, organization_id));
