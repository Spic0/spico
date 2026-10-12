-- Hotel holidays / schedule exceptions. Supports single-day (date_start =
-- date_end) or date-range entries.

create table public.hotel_holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  date_start date not null,
  date_end date not null,
  status text not null default 'closed' check (status in ('closed', 'modified_hours', 'special_operations')),
  open_time time,
  close_time time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_holidays_range_valid check (date_end >= date_start),
  constraint hotel_holidays_modified_hours_has_times check (
    status <> 'modified_hours' or (open_time is not null and close_time is not null and open_time < close_time)
  )
);

comment on table public.hotel_holidays is 'Hotel-specific holidays/exceptions to the weekly business hours. Feeds future AI schedule/handoff rules.';

create index hotel_holidays_hotel_idx on public.hotel_holidays (hotel_id);
create index hotel_holidays_date_range_idx on public.hotel_holidays (hotel_id, date_start, date_end);

create trigger trg_hotel_holidays_set_updated_at
  before update on public.hotel_holidays
  for each row execute function public.set_updated_at();

alter table public.hotel_holidays enable row level security;

create policy "hotel_holidays_select_permission"
  on public.hotel_holidays for select
  using (public.has_permission(auth.uid(), 'holidays.read', hotel_id, organization_id));

create policy "hotel_holidays_insert_permission"
  on public.hotel_holidays for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'holidays.manage', hotel_id, organization_id));

create policy "hotel_holidays_update_permission"
  on public.hotel_holidays for update
  using (public.has_permission(auth.uid(), 'holidays.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'holidays.manage', hotel_id, organization_id));

create policy "hotel_holidays_delete_permission"
  on public.hotel_holidays for delete
  using (public.has_permission(auth.uid(), 'holidays.manage', hotel_id, organization_id));
