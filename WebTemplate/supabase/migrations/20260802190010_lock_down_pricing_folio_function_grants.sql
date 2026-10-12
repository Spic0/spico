-- SECURITY FIX. PostgreSQL grants EXECUTE on newly created functions to
-- PUBLIC by default (unlike tables, which grant nothing to PUBLIC/anon by
-- default) — a fact 20260802190005's `grant ... to authenticated` statements
-- did not account for. This left create_reservation_folio(uuid) callable
-- directly by an ANONYMOUS user via PostgREST
-- (POST /rest/v1/rpc/create_reservation_folio), who could create a folio for
-- any reservation whose id they know — bypassing folio.manage RLS entirely,
-- since the function is SECURITY DEFINER. Found via a live verification call
-- against the deployed project, not theoretically — see docs/assumptions.md
-- M11 for the full account.
--
-- Explicitly revoking EXECUTE FROM PUBLIC removes the implicit grant; the
-- authenticated-only grant made in 20260802190005 is a separate, independent
-- grant and remains in place unaffected by this revoke. booking_create
-- (already anon-executable BY DESIGN, with its own internal validation) can
-- still call create_reservation_folio/reservation_nightly_total internally —
-- a nested call from within a SECURITY DEFINER function executes as that
-- function's OWNER, not the original caller, so this revoke does not affect
-- that path at all.

revoke execute on function public.rate_plan_nightly_rate(uuid, date, numeric) from public;
revoke execute on function public.reservation_nightly_total(uuid, numeric, date, date) from public;
revoke execute on function public.create_reservation_folio(uuid) from public;
