-- Weekly business hours per hotel. day_of_week uses ISO 8601 (1=Monday..
-- 7=Sunday). shift_index supports optional split shifts (e.g. a spa open
-- 09:00-12:00 and 14:00-18:00 on the same day). effective_from/effective_to
-- are informational only for now — no date-range-aware "current schedule"
-- resolution logic yet (see docs/assumptions.md); this is a foundation
-- table, not the AI-scheduling engine itself.

create table public.hotel_business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  shift_index smallint not null default 1 check (shift_index >= 1),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, day_of_week, shift_index),
  constraint hotel_business_hours_times_consistent check (
    is_closed
    or (open_time is not null and close_time is not null and open_time < close_time)
  ),
  constraint hotel_business_hours_effective_range check (
    effective_from is null or effective_to is null or effective_from <= effective_to
  )
);

comment on table public.hotel_business_hours is 'Weekly schedule per hotel, ISO day-of-week (1=Mon..7=Sun). Feeds future AI schedule/handoff rules — not consumed by any scheduling logic yet.';

create index hotel_business_hours_hotel_idx on public.hotel_business_hours (hotel_id);

create trigger trg_hotel_business_hours_set_updated_at
  before update on public.hotel_business_hours
  for each row execute function public.set_updated_at();

alter table public.hotel_business_hours enable row level security;

create policy "hotel_business_hours_select_permission"
  on public.hotel_business_hours for select
  using (public.has_permission(auth.uid(), 'schedules.read', hotel_id, organization_id));

create policy "hotel_business_hours_insert_permission"
  on public.hotel_business_hours for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'schedules.manage', hotel_id, organization_id));

create policy "hotel_business_hours_update_permission"
  on public.hotel_business_hours for update
  using (public.has_permission(auth.uid(), 'schedules.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'schedules.manage', hotel_id, organization_id));

create policy "hotel_business_hours_delete_permission"
  on public.hotel_business_hours for delete
  using (public.has_permission(auth.uid(), 'schedules.manage', hotel_id, organization_id));
