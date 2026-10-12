-- PMS completion (Milestone 11): housekeeping, folio & billing, channel
-- manager sync, seasonal rate calendars. Seasonal date-range price overrides
-- per rate plan. A night is covered by a season if date_start <= night <=
-- date_end (inclusive, calendar-style — e.g. "Christmas: Dec 24-26"), unlike
-- reservations' half-open [check_in, check_out) convention. No overlap
-- prevention at the DB level (would need a btree_gist exclusion constraint);
-- if two seasons for the same rate plan overlap a given night, the resolver
-- function picks the shortest (most specific) range, then earliest
-- created_at, deterministically — see docs/assumptions.md M11.

create table public.rate_plan_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  rate_plan_id uuid not null references public.rate_plans (id) on delete cascade,
  name text not null,
  date_start date not null,
  date_end date not null,
  nightly_amount numeric(12, 2) not null check (nightly_amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint rate_plan_seasons_valid_range check (date_end >= date_start)
);

comment on table public.rate_plan_seasons is 'Date-range nightly-price overrides for a rate plan. See public.rate_plan_nightly_rate() for resolution order.';

create index rate_plan_seasons_plan_idx on public.rate_plan_seasons (rate_plan_id, date_start, date_end);
create index rate_plan_seasons_hotel_idx on public.rate_plan_seasons (hotel_id);

alter table public.rate_plan_seasons enable row level security;

create policy "rate_plan_seasons_select_permission"
  on public.rate_plan_seasons for select
  using (public.has_permission(auth.uid(), 'pms.read', hotel_id, organization_id));

create policy "rate_plan_seasons_insert_permission"
  on public.rate_plan_seasons for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));

create policy "rate_plan_seasons_update_permission"
  on public.rate_plan_seasons for update
  using (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));

create policy "rate_plan_seasons_delete_permission"
  on public.rate_plan_seasons for delete
  using (public.has_permission(auth.uid(), 'pms.manage', hotel_id, organization_id));
