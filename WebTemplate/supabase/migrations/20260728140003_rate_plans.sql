-- Named nightly prices attached to a room type (e.g. "Flexible", "Non-
-- refundable"). A single flat nightly_amount per plan — seasonal/day-of-week
-- pricing calendars are a later milestone.

create table public.rate_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_type_id uuid not null references public.room_types (id) on delete cascade,
  name text not null,
  code text not null,
  nightly_amount numeric(12, 2) not null default 0 check (nightly_amount >= 0),
  refundable boolean not null default true,
  includes_breakfast boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, code)
);

comment on table public.rate_plans is 'Flat nightly price per room type. No seasonal/LOS pricing calendar in M6.';

create index rate_plans_hotel_idx on public.rate_plans (hotel_id);
create index rate_plans_type_idx on public.rate_plans (room_type_id);

create trigger trg_rate_plans_set_updated_at
  before update on public.rate_plans
  for each row execute function public.set_updated_at();

alter table public.rate_plans enable row level security;

create policy "rate_plans_select_permission"
  on public.rate_plans for select
  using (public.has_permission(auth.uid(), 'pms.read', hotel_id, organization_id));

create policy "rate_plans_insert_permission"
  on public.rate_plans for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));

create policy "rate_plans_update_permission"
  on public.rate_plans for update
  using (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));
