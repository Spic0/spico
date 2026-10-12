-- trg_organizations_seed_subscription (20260801180002) only fires on NEW
-- organization inserts — it does not retroactively cover organizations
-- created before this milestone. Backfill: every organization without a
-- subscription row gets the default 'starter'/'trialing' one, the same
-- state a newly-created org gets. Idempotent (WHERE NOT EXISTS), safe to
-- re-run.

insert into public.organization_subscriptions (organization_id, plan_id, status)
select o.id, p.id, 'trialing'
from public.organizations o
cross join lateral (select id from public.plans where key = 'starter' limit 1) p
where not exists (
  select 1 from public.organization_subscriptions os where os.organization_id = o.id
);
