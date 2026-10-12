-- One folio per reservation (guest billing ledger), auto-created by
-- public.create_reservation_folio() (20260802190005) at the same moment a
-- reservation is created — internal booking (M6), the public booking engine
-- (M7), and the Open API (M9) all go through that one function, so every
-- reservation gets identical folio behavior regardless of origin.
-- Free-standing/incidental folios not tied to a reservation are out of scope
-- for this milestone (reservation_id is required) — see docs/assumptions.md.

create table public.folios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  unique (reservation_id)
);

comment on table public.folios is 'One guest-billing ledger per reservation. Balance = sum(folio_line_items.amount) - sum(folio_payments.amount for status=completed), computed in the app, not stored.';

create index folios_hotel_idx on public.folios (hotel_id);
create index folios_status_idx on public.folios (hotel_id, status);

create trigger trg_folios_set_updated_at
  before update on public.folios
  for each row execute function public.set_updated_at();

alter table public.folios enable row level security;

create policy "folios_select_permission"
  on public.folios for select
  using (public.has_permission(auth.uid(), 'folio.read', hotel_id, organization_id));

create policy "folios_insert_permission"
  on public.folios for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));

create policy "folios_update_permission"
  on public.folios for update
  using (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));
