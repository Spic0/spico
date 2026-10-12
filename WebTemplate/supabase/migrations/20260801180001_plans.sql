-- Billing & platform administration polish (Milestone 10). Platform-wide plan
-- catalog — NOT org/hotel-scoped, this is global config visible to every
-- authenticated user (like pricing tiers on a marketing page) but only
-- writable by a platform superadmin, since a pricing change affects every
-- tenant on the platform (the highest blast radius of any write in the
-- system — stricter than the admin+superadmin bar used for org
-- suspend/platform_settings). See docs/rbac.md M10.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  monthly_price numeric(12, 2) not null default 0 check (monthly_price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  max_hotels smallint check (max_hotels is null or max_hotels > 0),
  max_users smallint check (max_users is null or max_users > 0),
  features jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is 'Platform-wide subscription plan catalog. max_hotels/max_users null = unlimited. Not enforced anywhere yet — see docs/assumptions.md M10.';

create index plans_status_idx on public.plans (status, sort_order);

create trigger trg_plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

-- Readable by any authenticated user — every org needs to see the catalog to
-- choose/compare plans, same as a public pricing page would show.
create policy "plans_select_authenticated"
  on public.plans for select
  to authenticated
  using (true);

create policy "plans_insert_superadmin"
  on public.plans for insert
  to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin'));

create policy "plans_update_superadmin"
  on public.plans for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin'));

insert into public.plans (key, name, description, monthly_price, max_hotels, max_users, features, sort_order) values
  ('starter', 'Starter', 'For a single property getting started with AI.', 0, 1, 5,
   '["1 hotel", "5 team members", "1 AI agent", "Email support"]'::jsonb, 1),
  ('professional', 'Professional', 'For growing hotel groups.', 199, 5, 25,
   '["Up to 5 hotels", "25 team members", "Unlimited AI agents", "Priority support", "Public booking engine"]'::jsonb, 2),
  ('enterprise', 'Enterprise', 'For large multi-property groups.', 0, null, null,
   '["Unlimited hotels", "Unlimited team members", "Unlimited AI agents", "Dedicated support", "Custom integrations"]'::jsonb, 3);

comment on column public.plans.monthly_price is 'Enterprise (0) means "contact us" pricing, not free — see the UI, which special-cases the enterprise key.';
