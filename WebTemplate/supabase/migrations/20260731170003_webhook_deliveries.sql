-- Shared helper for webhooks child tables: derives organization_id/hotel_id
-- from the parent webhook, same pattern as set_call_child_scope() /
-- set_ai_agent_child_scope() / set_conversation_child_scope().
create or replace function public.set_webhook_child_scope()
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
  from public.webhooks where id = new.webhook_id;

  if v_hotel_id is null then
    raise exception 'webhooks.id % not found', new.webhook_id;
  end if;

  new.hotel_id := v_hotel_id;
  new.organization_id := v_org_id;
  return new;
end;
$$;

-- Append-only delivery log. Delivery is attempted SYNCHRONOUSLY, inline with
-- the request that triggered the event (a bounded 3-attempt retry with a
-- short backoff — see lib/webhooks.ts deliverWebhookEvent()), not via a
-- durable queue/worker. There is no background process that later retries a
-- delivery that exhausted its inline attempts — see docs/assumptions.md M9
-- for the reasoning and what a real queue-backed version would need.
-- idempotency_key prevents the same (webhook, event) pair from being
-- enqueued twice if a handler is ever invoked more than once for one event.

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  response_status integer,
  response_excerpt text,
  created_at timestamptz not null default now(),
  unique (webhook_id, idempotency_key)
);

comment on table public.webhook_deliveries is 'Append-only delivery attempts. Delivery is inline/synchronous with bounded retries, not queue-backed — see docs/assumptions.md M9.';

create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);
create index webhook_deliveries_hotel_idx on public.webhook_deliveries (hotel_id);
create index webhook_deliveries_status_idx on public.webhook_deliveries (status);

create trigger trg_webhook_deliveries_set_scope
  before insert on public.webhook_deliveries
  for each row execute function public.set_webhook_child_scope();

alter table public.webhook_deliveries enable row level security;

create policy "webhook_deliveries_select_permission"
  on public.webhook_deliveries for select
  using (public.has_permission(auth.uid(), 'integrations.read', hotel_id, organization_id));

create policy "webhook_deliveries_insert_permission"
  on public.webhook_deliveries for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id));

create policy "webhook_deliveries_update_permission"
  on public.webhook_deliveries for update
  using (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id));
