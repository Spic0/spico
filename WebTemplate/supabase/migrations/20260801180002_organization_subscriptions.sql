-- Links an organization to a plan. provider is always 'stub' — no live
-- payment gateway is connected (see lib/billing.ts); changing plan_id is an
-- immediate, unpaid DB update in this milestone, not a real checkout.
-- Auto-seeded on organization creation (every org starts on 'starter',
-- status 'trialing') via a trigger, the same "seed on creation" pattern as
-- M2's departments and M3's agent child rows — so billing.read always has
-- something real to show without every create-org call site needing to
-- remember to seed it.

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  provider text not null default 'stub',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (organization_id)
);

comment on table public.organization_subscriptions is 'One row per organization. provider is always ''stub'' — plan changes are immediate/unpaid, no live payment gateway exists. See docs/roadmap.md (M10).';

create index organization_subscriptions_plan_idx on public.organization_subscriptions (plan_id);

create trigger trg_organization_subscriptions_set_updated_at
  before update on public.organization_subscriptions
  for each row execute function public.set_updated_at();

create or replace function public.seed_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starter_plan_id uuid;
begin
  select id into v_starter_plan_id from public.plans where key = 'starter' limit 1;
  if v_starter_plan_id is not null then
    insert into public.organization_subscriptions (organization_id, plan_id, status)
    values (new.id, v_starter_plan_id, 'trialing');
  end if;
  return new;
end;
$$;

create trigger trg_organizations_seed_subscription
  after insert on public.organizations
  for each row execute function public.seed_default_subscription();

alter table public.organization_subscriptions enable row level security;

create policy "organization_subscriptions_select_permission"
  on public.organization_subscriptions for select
  using (
    public.is_platform_user(auth.uid())
    or public.has_permission(auth.uid(), 'billing.read', null, organization_id)
  );

create policy "organization_subscriptions_update_permission"
  on public.organization_subscriptions for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin'))
    or public.has_permission(auth.uid(), 'billing.manage', null, organization_id)
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and platform_role in ('admin', 'superadmin'))
    or public.has_permission(auth.uid(), 'billing.manage', null, organization_id)
  );
