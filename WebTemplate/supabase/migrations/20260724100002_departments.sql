-- Hotel departments (Milestone 2). Lifecycle is status-based (active/
-- inactive), matching the M1 `memberships` convention of revoking rather than
-- hard-deleting — no separate deleted_at column.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  code text not null check (code ~ '^[A-Z0-9_]{2,20}$'),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.departments is 'Hotel operational departments (Reception, Housekeeping, etc). Deactivate rather than delete.';

-- Prevents duplicate *active* codes per hotel while still allowing a new
-- active department to reuse a code that was deactivated earlier.
create unique index departments_unique_active_code
  on public.departments (hotel_id, code)
  where (status = 'active');

create index departments_hotel_idx on public.departments (hotel_id);
create index departments_org_idx on public.departments (organization_id);
create index departments_status_idx on public.departments (status);

create trigger trg_departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- Seed the standard department set exactly once, when a hotel is created.
-- Deliberately only fires on INSERT — deactivating/editing a seeded
-- department afterwards never gets it recreated.
create or replace function public.seed_default_departments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.departments (organization_id, hotel_id, name, code) values
    (new.organization_id, new.id, 'Reception', 'RECEPTION'),
    (new.organization_id, new.id, 'Reservations', 'RESERVATIONS'),
    (new.organization_id, new.id, 'Housekeeping', 'HOUSEKEEPING'),
    (new.organization_id, new.id, 'Concierge', 'CONCIERGE'),
    (new.organization_id, new.id, 'Restaurant', 'RESTAURANT'),
    (new.organization_id, new.id, 'Spa', 'SPA'),
    (new.organization_id, new.id, 'Management', 'MANAGEMENT');
  return new;
end;
$$;

create trigger trg_hotels_seed_departments
  after insert on public.hotels
  for each row execute function public.seed_default_departments();

alter table public.departments enable row level security;

create policy "departments_select_permission"
  on public.departments for select
  using (public.has_permission(auth.uid(), 'departments.read', hotel_id, organization_id));

create policy "departments_insert_permission"
  on public.departments for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'departments.manage', hotel_id, organization_id));

create policy "departments_update_permission"
  on public.departments for update
  using (public.has_permission(auth.uid(), 'departments.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'departments.manage', hotel_id, organization_id));
