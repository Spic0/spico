-- Guest profiles. Hotel-scoped (a guest record belongs to the hotel that
-- created it; cross-hotel guest identity resolution is out of scope for M6).
-- Contains PII — read is gated behind guests.read, not given to Platform
-- Moderator.

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  vip boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.guests is 'Guest profile (PII). Hotel-scoped; no cross-hotel identity resolution in M6.';

create index guests_hotel_idx on public.guests (hotel_id);
create index guests_name_idx on public.guests (hotel_id, last_name, first_name);
create index guests_email_idx on public.guests (hotel_id, email);

create trigger trg_guests_set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

alter table public.guests enable row level security;

create policy "guests_select_permission"
  on public.guests for select
  using (public.has_permission(auth.uid(), 'guests.read', hotel_id, organization_id));

create policy "guests_insert_permission"
  on public.guests for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'guests.manage', hotel_id, organization_id));

create policy "guests_update_permission"
  on public.guests for update
  using (public.has_permission(auth.uid(), 'guests.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'guests.manage', hotel_id, organization_id));
