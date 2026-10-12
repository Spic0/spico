-- Integrations, API keys, webhooks (Milestone 9). Hotel-scoped API keys for
-- the public Open API (app/api/v1/*). Only a SHA-256 hash of the key is ever
-- stored — the plaintext value is shown exactly once, at creation, in the
-- server action's return value (never persisted). This mirrors how GitHub/
-- Stripe issue bearer tokens: possession of the plaintext is the credential,
-- so the server must not be able to recover it. Contrast with webhooks.secret
-- (20260731170002), which IS stored retrievably because HMAC signing requires
-- the server to reuse the same symmetric secret on every delivery.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (key_hash)
);

comment on table public.api_keys is 'Hotel-scoped Open API credentials. Only key_hash (SHA-256) is stored; the plaintext key is shown once at creation. scopes is a JSON array of scope strings, see lib/apiKeys.ts.';

create index api_keys_hotel_idx on public.api_keys (hotel_id);
create index api_keys_prefix_idx on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

create policy "api_keys_select_permission"
  on public.api_keys for select
  using (public.has_permission(auth.uid(), 'integrations.read', hotel_id, organization_id));

create policy "api_keys_insert_permission"
  on public.api_keys for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'api_keys.manage', hotel_id, organization_id));

create policy "api_keys_update_permission"
  on public.api_keys for update
  using (public.has_permission(auth.uid(), 'api_keys.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'api_keys.manage', hotel_id, organization_id));
