-- Milestone 12 safe demo/test-data seeding: two SECURITY DEFINER functions
-- that perform every multi-table write atomically (Postgres wraps a
-- function body in one implicit transaction) and are fully idempotent —
-- re-running seed_hotel_test_data() never duplicates rows, and
-- remove_hotel_test_data() only ever touches rows it (or a prior run of it)
-- created, identified exclusively by is_test_data = true.
--
-- SECURITY: per the M11 standing rule (see docs/assumptions.md M11 #1),
-- omitting a grant is NOT sufficient to keep a SECURITY DEFINER function
-- restricted — EXECUTE must be explicitly revoked from public/anon and
-- granted only to authenticated, AND (unlike every other SECURITY DEFINER
-- function in this project) these two ALSO re-check the caller's identity
-- INSIDE the function body. That second check exists because the app-level
-- gate for this feature (lib/demoData.ts's requireOwnerOrSuperadmin()) is
-- deliberately non-standard — it excludes Platform Admin, unlike every
-- other has_permission()-gated feature — and granting EXECUTE to
-- `authenticated` alone would let ANY logged-in user invoke this RPC
-- directly (bypassing the app entirely) without that check. See
-- docs/rbac.md Milestone 12 section.

create or replace function public.assert_hotel_owner_or_superadmin(p_hotel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.hotels where id = p_hotel_id;
  if v_org_id is null then
    raise exception 'hotels.id % not found', p_hotel_id;
  end if;

  if exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin'
  ) then
    return;
  end if;

  if exists (
    select 1 from public.memberships
    where profile_id = auth.uid()
      and status = 'active'
      and role_key = 'hotel_owner'
      and (hotel_id = p_hotel_id or (hotel_id is null and organization_id = v_org_id))
  ) then
    return;
  end if;

  raise exception 'Not authorized: only the hotel owner or a platform superadmin may manage test data';
end;
$$;

create or replace function public.seed_hotel_test_data(p_hotel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_default_lang text;
  v_room_type_id uuid;
  v_room1_id uuid;
  v_room2_id uuid;
  v_rate_plan_id uuid;
  v_guest1_id uuid;
  v_guest2_id uuid;
  v_kb_category_id uuid;
  v_channel_id uuid;
  v_conversation_id uuid;
begin
  perform public.assert_hotel_owner_or_superadmin(p_hotel_id);

  select organization_id, coalesce(default_guest_language, 'en')
    into v_org_id, v_default_lang
  from public.hotels where id = p_hotel_id;

  -- room_types ---------------------------------------------------------------
  select id into v_room_type_id from public.room_types where hotel_id = p_hotel_id and is_test_data limit 1;
  if v_room_type_id is null then
    insert into public.room_types (organization_id, hotel_id, name, code, description, max_occupancy, base_rate, is_test_data)
    values (v_org_id, p_hotel_id, 'Test Data Standard Room', 'DEMO-STD', 'Test Data — Not a Real Guest or Reservation', 2, 100, true)
    returning id into v_room_type_id;
  end if;

  -- rooms ----------------------------------------------------------------------
  select id into v_room1_id from public.rooms where hotel_id = p_hotel_id and is_test_data order by room_number limit 1;
  if v_room1_id is null then
    insert into public.rooms (organization_id, hotel_id, room_type_id, room_number, is_test_data)
    values (v_org_id, p_hotel_id, v_room_type_id, 'DEMO-101', true)
    returning id into v_room1_id;
    insert into public.rooms (organization_id, hotel_id, room_type_id, room_number, is_test_data)
    values (v_org_id, p_hotel_id, v_room_type_id, 'DEMO-102', true)
    returning id into v_room2_id;
  else
    select id into v_room2_id from public.rooms
    where hotel_id = p_hotel_id and is_test_data and id != v_room1_id limit 1;
  end if;

  -- rate_plans -------------------------------------------------------------------
  select id into v_rate_plan_id from public.rate_plans where hotel_id = p_hotel_id and is_test_data limit 1;
  if v_rate_plan_id is null then
    insert into public.rate_plans (organization_id, hotel_id, room_type_id, name, code, nightly_amount, is_test_data)
    values (v_org_id, p_hotel_id, v_room_type_id, 'Test Data Standard Rate', 'DEMO-RATE', 100, true)
    returning id into v_rate_plan_id;
  end if;

  -- guests -------------------------------------------------------------------------
  select id into v_guest1_id from public.guests where hotel_id = p_hotel_id and is_test_data order by email limit 1;
  if v_guest1_id is null then
    insert into public.guests (organization_id, hotel_id, first_name, last_name, email, notes, is_test_data)
    values (v_org_id, p_hotel_id, 'Test', 'Guest One', 'demo.guest.1@spico.test', 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_guest1_id;
    insert into public.guests (organization_id, hotel_id, first_name, last_name, email, notes, is_test_data)
    values (v_org_id, p_hotel_id, 'Test', 'Guest Two', 'demo.guest.2@spico.test', 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_guest2_id;
  else
    select id into v_guest2_id from public.guests
    where hotel_id = p_hotel_id and is_test_data and id != v_guest1_id limit 1;
  end if;

  -- reservations, two different lifecycle states ---------------------------------
  if not exists (select 1 from public.reservations where hotel_id = p_hotel_id and is_test_data) then
    insert into public.reservations (
      organization_id, hotel_id, confirmation_code, guest_id, room_type_id, rate_plan_id,
      check_in_date, check_out_date, status, total_amount, currency, source, notes, is_test_data
    ) values (
      v_org_id, p_hotel_id, 'DEMO-0001', v_guest1_id, v_room_type_id, v_rate_plan_id,
      current_date + 7, current_date + 10, 'confirmed', 300, 'EUR', 'test_data',
      'Test Data — Not a Real Guest or Reservation', true
    );
    insert into public.reservations (
      organization_id, hotel_id, confirmation_code, guest_id, room_type_id, room_id, rate_plan_id,
      check_in_date, check_out_date, status, total_amount, currency, source, notes, is_test_data
    ) values (
      v_org_id, p_hotel_id, 'DEMO-0002', v_guest2_id, v_room_type_id, v_room2_id, v_rate_plan_id,
      current_date - 1, current_date + 2, 'checked_in', 300, 'EUR', 'test_data',
      'Test Data — Not a Real Guest or Reservation', true
    );
  end if;

  -- one draft AI agent -------------------------------------------------------------
  if not exists (select 1 from public.ai_agents where hotel_id = p_hotel_id and is_test_data) then
    insert into public.ai_agents (
      organization_id, hotel_id, name, slug, description, agent_type, default_language, is_test_data
    ) values (
      v_org_id, p_hotel_id, 'Test Data Demo Agent', 'test-data-demo-agent',
      'Test Data — Not a Real Guest or Reservation. Draft agent for internal testing only.',
      'concierge', v_default_lang, true
    );
  end if;

  -- knowledge base: one category, two draft articles --------------------------------
  select id into v_kb_category_id from public.kb_categories where hotel_id = p_hotel_id and is_test_data limit 1;
  if v_kb_category_id is null then
    insert into public.kb_categories (organization_id, hotel_id, name, slug, description, is_test_data)
    values (v_org_id, p_hotel_id, 'Test Data', 'test-data', 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_kb_category_id;
  end if;

  if not exists (select 1 from public.kb_articles where hotel_id = p_hotel_id and is_test_data) then
    insert into public.kb_articles (organization_id, hotel_id, category_id, article_type, title, summary, body, language_code, is_test_data)
    values
      (v_org_id, p_hotel_id, v_kb_category_id, 'faq', 'Test Data FAQ 1', 'Test Data — Not a Real Guest or Reservation',
       'Test Data — Not a Real Guest or Reservation. Placeholder FAQ content for internal testing.', v_default_lang, true),
      (v_org_id, p_hotel_id, v_kb_category_id, 'faq', 'Test Data FAQ 2', 'Test Data — Not a Real Guest or Reservation',
       'Test Data — Not a Real Guest or Reservation. Placeholder FAQ content for internal testing.', v_default_lang, true);
  end if;

  -- sample inbox conversation, clearly marked ------------------------------------------
  select id into v_channel_id from public.channels where hotel_id = p_hotel_id and is_test_data limit 1;
  if v_channel_id is null then
    insert into public.channels (organization_id, hotel_id, channel_type, name, is_test_data)
    values (v_org_id, p_hotel_id, 'web_chat', 'Test Data Web Chat', true)
    returning id into v_channel_id;
  end if;

  select id into v_conversation_id from public.conversations where hotel_id = p_hotel_id and is_test_data limit 1;
  if v_conversation_id is null then
    insert into public.conversations (organization_id, hotel_id, channel_id, subject, guest_display_name, guest_identifier, is_test_data)
    values (v_org_id, p_hotel_id, v_channel_id, 'Test Data — Not a Real Guest or Reservation', 'Test Data Guest', 'test-data@spico.test', true)
    returning id into v_conversation_id;

    insert into public.messages (conversation_id, direction, sender_type, body, is_test_data)
    values
      (v_conversation_id, 'inbound', 'guest', 'Test Data — Not a Real Guest or Reservation: sample inbound message for testing the inbox.', true),
      (v_conversation_id, 'outbound', 'system', 'Test Data — Not a Real Guest or Reservation: sample reply for testing the inbox.', true);
  end if;

  -- booking engine settings, explicitly disabled, never overwriting a real row ----------
  if not exists (select 1 from public.booking_settings where hotel_id = p_hotel_id) then
    insert into public.booking_settings (organization_id, hotel_id, enabled, terms, is_test_data)
    values (v_org_id, p_hotel_id, false, 'Test Data — Not a Real Guest or Reservation', true);
  end if;
end;
$$;

create or replace function public.remove_hotel_test_data(p_hotel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_hotel_owner_or_superadmin(p_hotel_id);

  -- Child-before-parent order, respecting ON DELETE RESTRICT constraints.
  -- folios/folio_line_items/folio_payments/housekeeping_tasks are NOT listed
  -- here explicitly: they cascade automatically (ON DELETE CASCADE) from
  -- reservations/rooms respectively, and only ever reference these specific
  -- test rows since a real folio/task references a real (non-test)
  -- reservation/room with a different id.
  delete from public.reservations where hotel_id = p_hotel_id and is_test_data;
  delete from public.rooms where hotel_id = p_hotel_id and is_test_data;
  delete from public.rate_plans where hotel_id = p_hotel_id and is_test_data;
  delete from public.room_types where hotel_id = p_hotel_id and is_test_data;
  delete from public.guests where hotel_id = p_hotel_id and is_test_data;
  delete from public.kb_articles where hotel_id = p_hotel_id and is_test_data;
  delete from public.kb_categories where hotel_id = p_hotel_id and is_test_data;
  delete from public.messages where hotel_id = p_hotel_id and is_test_data;
  delete from public.conversations where hotel_id = p_hotel_id and is_test_data;
  delete from public.channels where hotel_id = p_hotel_id and is_test_data;
  delete from public.booking_settings where hotel_id = p_hotel_id and is_test_data;
  delete from public.ai_agents where hotel_id = p_hotel_id and is_test_data;
end;
$$;

revoke execute on function public.assert_hotel_owner_or_superadmin(uuid) from public;
revoke execute on function public.assert_hotel_owner_or_superadmin(uuid) from anon;
revoke execute on function public.assert_hotel_owner_or_superadmin(uuid) from authenticated;
grant execute on function public.assert_hotel_owner_or_superadmin(uuid) to authenticated;

revoke execute on function public.seed_hotel_test_data(uuid) from public;
revoke execute on function public.seed_hotel_test_data(uuid) from anon;
revoke execute on function public.seed_hotel_test_data(uuid) from authenticated;
grant execute on function public.seed_hotel_test_data(uuid) to authenticated;

revoke execute on function public.remove_hotel_test_data(uuid) from public;
revoke execute on function public.remove_hotel_test_data(uuid) from anon;
revoke execute on function public.remove_hotel_test_data(uuid) from authenticated;
grant execute on function public.remove_hotel_test_data(uuid) to authenticated;
