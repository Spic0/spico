-- SECURITY FIX, continued. 20260802190010's `revoke ... from public` did NOT
-- close the gap — verified live: anon could still call
-- create_reservation_folio/reservation_nightly_total/rate_plan_nightly_rate
-- after that migration applied. Root cause: Supabase provisions the `anon`
-- and `authenticated` roles with their OWN direct EXECUTE grants on the
-- `public` schema (via ALTER DEFAULT PRIVILEGES at project setup), separate
-- from and in addition to PostgreSQL's PUBLIC pseudo-role default. Revoking
-- from PUBLIC alone never touched `anon`'s own independent grant.
--
-- The correct fix: revoke EXECUTE from `anon` specifically. Also revoke and
-- re-grant `authenticated` explicitly to make the intended state
-- unambiguous rather than relying on which pre-existing grant happens to
-- still be in effect.

revoke execute on function public.rate_plan_nightly_rate(uuid, date, numeric) from anon;
revoke execute on function public.reservation_nightly_total(uuid, numeric, date, date) from anon;
revoke execute on function public.create_reservation_folio(uuid) from anon;

revoke execute on function public.rate_plan_nightly_rate(uuid, date, numeric) from authenticated;
revoke execute on function public.reservation_nightly_total(uuid, numeric, date, date) from authenticated;
revoke execute on function public.create_reservation_folio(uuid) from authenticated;

grant execute on function public.rate_plan_nightly_rate(uuid, date, numeric) to authenticated;
grant execute on function public.reservation_nightly_total(uuid, numeric, date, date) to authenticated;
grant execute on function public.create_reservation_folio(uuid) to authenticated;
