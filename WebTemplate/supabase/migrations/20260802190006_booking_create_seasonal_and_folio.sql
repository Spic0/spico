-- Milestone 11: replace booking_create() (originally 20260729150002) with an
-- identical signature and identical validation, but two changes to the body:
--   1. total_amount now uses reservation_nightly_total() so a public booking
--      correctly reflects any seasonal rate_plan_seasons overrides, instead
--      of always multiplying nights * a single flat rate.
--   2. the newly-created reservation's id is captured and passed to
--      create_reservation_folio(), so a public booking gets a real folio
--      with per-night room-charge line items, same as the internal (M6) and
--      Open API (M9) reservation-creation paths.
-- `create or replace function` with the same signature preserves the
-- existing anon EXECUTE grant — no re-grant needed.

create or replace function public.booking_create(
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults int,
  p_children int,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns table (confirmation_code text, total_amount numeric, currency text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_currency text;
  v_enabled boolean;
  v_min smallint;
  v_max smallint;
  v_max_occ smallint;
  v_base numeric;
  v_nightly numeric;
  v_nights int;
  v_rooms int;
  v_occupied int;
  v_guest uuid;
  v_code text;
  v_total numeric;
  v_attempt int := 0;
  v_reservation_id uuid;
begin
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'Guest name is required';
  end if;
  if p_adults is null or p_adults < 1 or p_adults > 20 then raise exception 'Invalid number of adults'; end if;
  if p_children is null or p_children < 0 or p_children > 20 then raise exception 'Invalid number of children'; end if;

  v_nights := (p_check_out - p_check_in);
  if v_nights < 1 then raise exception 'Check-out must be after check-in'; end if;
  if p_check_in < current_date then raise exception 'Check-in cannot be in the past'; end if;

  select h.organization_id, h.default_currency, coalesce(bs.enabled, false),
         coalesce(bs.min_nights, 1::smallint), coalesce(bs.max_nights, 30::smallint)
    into v_org, v_currency, v_enabled, v_min, v_max
  from public.hotels h
  left join public.booking_settings bs on bs.hotel_id = h.id
  where h.id = p_hotel_id and h.status = 'active';

  if v_org is null then raise exception 'Hotel not found'; end if;
  if not v_enabled then raise exception 'Online booking is not available for this hotel'; end if;
  if v_nights < v_min then raise exception 'Minimum stay is % night(s)', v_min; end if;
  if v_nights > v_max then raise exception 'Maximum stay is % night(s)', v_max; end if;

  select rt.max_occupancy, rt.base_rate into v_max_occ, v_base
  from public.room_types rt
  where rt.id = p_room_type_id and rt.hotel_id = p_hotel_id and rt.status = 'active';
  if v_max_occ is null then raise exception 'Room type not available'; end if;
  if (p_adults + p_children) > v_max_occ then raise exception 'Too many guests for this room type'; end if;

  v_nightly := v_base;
  if p_rate_plan_id is not null then
    select rp.nightly_amount into v_nightly
    from public.rate_plans rp
    where rp.id = p_rate_plan_id and rp.hotel_id = p_hotel_id
      and rp.room_type_id = p_room_type_id and rp.status = 'active';
    if v_nightly is null then raise exception 'Selected rate plan is not available'; end if;
  end if;

  -- Re-check availability at write time (authoritative guard against overbooking).
  select count(*) into v_rooms from public.rooms r
    where r.hotel_id = p_hotel_id and r.room_type_id = p_room_type_id
      and r.status = 'active' and r.housekeeping_status <> 'out_of_service';
  select count(*) into v_occupied from public.reservations rv
    where rv.hotel_id = p_hotel_id and rv.room_type_id = p_room_type_id
      and rv.status in ('pending', 'confirmed', 'checked_in')
      and rv.check_in_date < p_check_out and rv.check_out_date > p_check_in;
  if (v_rooms - v_occupied) <= 0 then
    raise exception 'No availability for the selected dates';
  end if;

  -- M11: per-night total (honors rate_plan_seasons overrides), not a flat
  -- nights * v_nightly multiplication.
  v_total := round(public.reservation_nightly_total(p_rate_plan_id, v_nightly, p_check_in, p_check_out), 2);

  insert into public.guests (organization_id, hotel_id, first_name, last_name, email, phone)
  values (v_org, p_hotel_id, trim(p_first_name), trim(p_last_name),
          nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_phone, '')), ''))
  returning id into v_guest;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    begin
      insert into public.reservations (
        organization_id, hotel_id, confirmation_code, guest_id, room_type_id, rate_plan_id,
        check_in_date, check_out_date, adults, children, status, total_amount, currency, source
      ) values (
        v_org, p_hotel_id, v_code, v_guest, p_room_type_id, p_rate_plan_id,
        p_check_in, p_check_out, p_adults, p_children, 'pending', v_total, v_currency, 'booking_engine'
      )
      returning id into v_reservation_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 6 then raise exception 'Could not allocate a confirmation code'; end if;
    end;
  end loop;

  -- M11: real folio with per-night room-charge line items.
  perform public.create_reservation_folio(v_reservation_id);

  confirmation_code := v_code;
  total_amount := v_total;
  currency := v_currency;
  return next;
end;
$$;
