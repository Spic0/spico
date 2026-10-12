-- Shared helper for calls child tables: derives organization_id/hotel_id from
-- the parent call, same pattern as set_ai_agent_child_scope() /
-- set_conversation_child_scope().
create or replace function public.set_call_child_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_org_id uuid;
begin
  select hotel_id, organization_id into v_hotel_id, v_org_id
  from public.calls where id = new.call_id;

  if v_hotel_id is null then
    raise exception 'calls.id % not found', new.call_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Append-only event log for a call (state transitions, agent selection,
-- handoff decisions). payload is a small JSON blob describing the event —
-- every M8 event is written by the simulate path and is clearly a simulation,
-- never a live call-control callback.
create table public.call_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'call.received', 'call.answered', 'call.agent_selected', 'call.handoff_triggered',
      'call.handoff_completed', 'call.completed', 'call.failed', 'call.note'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.call_events is 'Append-only per-call event log written by the voice-service. M8 events all originate from the simulate path, not a live call-control webhook.';

create index call_events_call_idx on public.call_events (call_id, created_at);
create index call_events_hotel_idx on public.call_events (hotel_id);

create trigger trg_call_events_set_scope
  before insert on public.call_events
  for each row execute function public.set_call_child_scope();

alter table public.call_events enable row level security;

create policy "call_events_select_permission"
  on public.call_events for select
  using (public.has_permission(auth.uid(), 'calls.read', hotel_id, organization_id));

create policy "call_events_insert_permission"
  on public.call_events for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'calls.manage', hotel_id, organization_id));
