-- Shared pricing + folio-creation functions, called from all THREE places a
-- reservation can be created: the internal Reservations action (M6), the
-- public booking engine's booking_create RPC (M7, replaced below to use
-- these), and the Open API's POST /reservations (M9). One authoritative
-- implementation avoids the three call sites silently drifting out of sync
-- on how seasonal pricing or folio creation works.
--
-- All SECURITY DEFINER (consistent with has_permission()/booking_create()/
-- etc.) so they behave identically regardless of the caller's own RLS
-- standing. EXECUTE is granted to `authenticated` only, NOT anon —
-- create_reservation_folio(uuid) must never be directly callable by an
-- anonymous guest (it would let anyone create a folio for any reservation by
-- guessing/enumerating an id). booking_create (already SECURITY DEFINER,
-- anon-executable) can still call it internally: nested calls from within a
-- SECURITY DEFINER function execute as that function's owner, which is why
-- no separate anon grant is needed here.

-- Resolves ONE night's rate for a rate plan: the most specific
-- (shortest-range) overlapping season if any, tie-broken by earliest
-- created_at, else the fallback (the reservation's original flat rate).
-- p_rate_plan_id may be null (booking used the room type's base rate with no
-- specific plan) — in that case the season lookup naturally matches zero
-- rows and this returns p_fallback.
create or replace function public.rate_plan_nightly_rate(
  p_rate_plan_id uuid,
  p_night date,
  p_fallback numeric
) returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select nightly_amount from public.rate_plan_seasons
      where rate_plan_id = p_rate_plan_id
        and p_night between date_start and date_end
      order by (date_end - date_start) asc, created_at asc
      limit 1
    ),
    p_fallback
  );
$$;

-- Sums rate_plan_nightly_rate() over every night in [check_in, check_out).
create or replace function public.reservation_nightly_total(
  p_rate_plan_id uuid,
  p_fallback_nightly numeric,
  p_check_in date,
  p_check_out date
) returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(public.rate_plan_nightly_rate(p_rate_plan_id, night::date, p_fallback_nightly)), 0)
  from generate_series(p_check_in, p_check_out - interval '1 day', interval '1 day') as night;
$$;

-- Creates a folio + one 'room' category line item per night for a
-- reservation, using the same per-night rate resolution as
-- reservation_nightly_total() above (so the folio's line items always sum to
-- the same total that function would compute). Idempotent: if a folio
-- already exists for this reservation, returns its id instead of erroring or
-- duplicating line items.
create or replace function public.create_reservation_folio(p_reservation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_folio_id uuid;
  v_room_type_base numeric;
  v_rate_plan_nightly numeric;
  v_fallback numeric;
  v_night date;
  v_amount numeric;
begin
  select id, organization_id, hotel_id, room_type_id, rate_plan_id, check_in_date, check_out_date, currency
    into v_reservation
  from public.reservations where id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'reservations.id % not found', p_reservation_id;
  end if;

  select id into v_folio_id from public.folios where reservation_id = p_reservation_id;
  if v_folio_id is not null then
    return v_folio_id;
  end if;

  select base_rate into v_room_type_base from public.room_types where id = v_reservation.room_type_id;

  if v_reservation.rate_plan_id is not null then
    select nightly_amount into v_rate_plan_nightly from public.rate_plans where id = v_reservation.rate_plan_id;
  end if;
  v_fallback := coalesce(v_rate_plan_nightly, v_room_type_base, 0);

  insert into public.folios (organization_id, hotel_id, reservation_id, currency)
  values (v_reservation.organization_id, v_reservation.hotel_id, v_reservation.id, v_reservation.currency)
  returning id into v_folio_id;

  v_night := v_reservation.check_in_date;
  while v_night < v_reservation.check_out_date loop
    v_amount := public.rate_plan_nightly_rate(v_reservation.rate_plan_id, v_night, v_fallback);
    insert into public.folio_line_items (folio_id, category, description, service_date, quantity, unit_amount)
    values (v_folio_id, 'room', 'Room charge — ' || to_char(v_night, 'YYYY-MM-DD'), v_night, 1, v_amount);
    v_night := v_night + 1;
  end loop;

  return v_folio_id;
end;
$$;

grant execute on function public.rate_plan_nightly_rate(uuid, date, numeric) to authenticated;
grant execute on function public.reservation_nightly_total(uuid, numeric, date, date) to authenticated;
grant execute on function public.create_reservation_folio(uuid) to authenticated;
