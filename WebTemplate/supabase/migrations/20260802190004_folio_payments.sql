-- Payments recorded against a folio. provider is always 'stub' — no live
-- payment gateway is connected (same discipline as lib/billing.ts's platform
-- subscription billing, M10): recording a payment here means staff noted
-- that cash/card/transfer was received, not that a card was actually
-- charged through this system.

create table public.folio_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  folio_id uuid not null references public.folios (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
  provider text not null default 'stub',
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.folio_payments is 'provider is always ''stub'' — no live payment gateway. A row means staff recorded a payment, not that this system processed a real charge.';

create index folio_payments_folio_idx on public.folio_payments (folio_id);
create index folio_payments_hotel_idx on public.folio_payments (hotel_id);

create trigger trg_folio_payments_set_scope
  before insert on public.folio_payments
  for each row execute function public.set_folio_child_scope();

alter table public.folio_payments enable row level security;

create policy "folio_payments_select_permission"
  on public.folio_payments for select
  using (public.has_permission(auth.uid(), 'folio.read', hotel_id, organization_id));

create policy "folio_payments_insert_permission"
  on public.folio_payments for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));

create policy "folio_payments_update_permission"
  on public.folio_payments for update
  using (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'folio.manage', hotel_id, organization_id));
