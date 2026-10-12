-- Foundation only: a place for a future recording's Storage path once a live
-- Telnyx call-recording integration exists. No bucket is created in M8 (no
-- code writes a row to this table yet) — same "ships the column, not the
-- capability" pattern as M2's business-hours effective_from/effective_to.

create table public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  storage_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);

comment on table public.call_recordings is 'Foundation only — no Storage bucket exists yet and nothing writes here in M8. See docs/roadmap.md.';

create index call_recordings_call_idx on public.call_recordings (call_id);
create index call_recordings_hotel_idx on public.call_recordings (hotel_id);

create trigger trg_call_recordings_set_scope
  before insert on public.call_recordings
  for each row execute function public.set_call_child_scope();

alter table public.call_recordings enable row level security;

create policy "call_recordings_select_permission"
  on public.call_recordings for select
  using (public.has_permission(auth.uid(), 'calls.read', hotel_id, organization_id));

create policy "call_recordings_insert_permission"
  on public.call_recordings for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'calls.manage', hotel_id, organization_id));
