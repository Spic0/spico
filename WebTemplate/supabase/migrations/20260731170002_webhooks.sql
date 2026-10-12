-- Outbound webhook subscriptions. `secret` is stored retrievably (not
-- hashed) — unlike api_keys.key_hash, the server must reuse this exact value
-- on every delivery to compute the HMAC-SHA256 signature the subscriber
-- verifies against (see lib/webhooks.ts), so hashing it would make delivery
-- impossible. Access is still gated by webhooks.manage (GM/Owner tier).

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  url text not null,
  secret text not null,
  event_types jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

comment on table public.webhooks is 'Outbound webhook subscriptions. event_types is a JSON array of event type strings, see lib/webhooks.ts EVENT_TYPES.';

create index webhooks_hotel_idx on public.webhooks (hotel_id);

create trigger trg_webhooks_set_updated_at
  before update on public.webhooks
  for each row execute function public.set_updated_at();

alter table public.webhooks enable row level security;

create policy "webhooks_select_permission"
  on public.webhooks for select
  using (public.has_permission(auth.uid(), 'integrations.read', hotel_id, organization_id));

create policy "webhooks_insert_permission"
  on public.webhooks for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id));

create policy "webhooks_update_permission"
  on public.webhooks for update
  using (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id));

create policy "webhooks_delete_permission"
  on public.webhooks for delete
  using (public.has_permission(auth.uid(), 'webhooks.manage', hotel_id, organization_id));
