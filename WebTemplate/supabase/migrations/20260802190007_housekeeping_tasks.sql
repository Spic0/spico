-- Housekeeping task board. A room's single housekeeping_status column (M6)
-- remains the quick-glance signal; this table is the actual workflow —
-- assignable, trackable tasks with a lifecycle (pending -> in_progress ->
-- completed -> verified). A checkout_clean task is auto-created by
-- checkOutReservationAction (app code, not a DB trigger — consistent with
-- that action already setting housekeeping_status='dirty' in app code).

create table public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  task_type text not null check (task_type in ('checkout_clean', 'stayover_clean', 'inspection', 'maintenance')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'verified')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to uuid references public.memberships (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.housekeeping_tasks is 'Assignable housekeeping workflow tasks. See rooms.housekeeping_status (M6) for the quick per-room status flag this complements.';

create index housekeeping_tasks_hotel_idx on public.housekeeping_tasks (hotel_id);
create index housekeeping_tasks_status_idx on public.housekeeping_tasks (hotel_id, status);
create index housekeeping_tasks_room_idx on public.housekeeping_tasks (room_id);
create index housekeeping_tasks_assignee_idx on public.housekeeping_tasks (assigned_to);

alter table public.housekeeping_tasks enable row level security;

create policy "housekeeping_tasks_select_permission"
  on public.housekeeping_tasks for select
  using (public.has_permission(auth.uid(), 'housekeeping.read', hotel_id, organization_id));

create policy "housekeeping_tasks_insert_permission"
  on public.housekeeping_tasks for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'housekeeping.manage', hotel_id, organization_id));

create policy "housekeeping_tasks_update_permission"
  on public.housekeeping_tasks for update
  using (public.has_permission(auth.uid(), 'housekeeping.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'housekeeping.manage', hotel_id, organization_id));
