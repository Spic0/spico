-- Reservation origin (M13). Link a reservation to the inbox conversation OR the
-- phone call it came from, so the reservation detail page can deep-link to the
-- chat / email / SMS / WhatsApp transcript or the recorded call. Both FKs are
-- ON DELETE SET NULL (a deleted thread/call must not delete the booking).
--
-- Also tags `calls` with is_test_data — it is the one table the M12 seeder
-- touches that never had the flag — and extends seed_hotel_test_data() /
-- remove_hotel_test_data() with messaging + voice origin examples. The new seed
-- block is guarded by a DEMO-0003 existence check so it also backfills hotels
-- that were already seeded by the previous version, and stays idempotent.

-- 1. schema ------------------------------------------------------------------
alter table public.reservations
  add column conversation_id uuid references public.conversations (id) on delete set null,
  add column call_id uuid references public.calls (id) on delete set null;

create index reservations_conversation_idx on public.reservations (conversation_id);
create index reservations_call_idx on public.reservations (call_id);

comment on column public.reservations.conversation_id is 'Inbox conversation this booking originated from (email/SMS/WhatsApp/web chat), if any. ON DELETE SET NULL.';
comment on column public.reservations.call_id is 'Phone call this booking originated from, if any. ON DELETE SET NULL.';

alter table public.calls add column is_test_data boolean not null default false;
create index calls_is_test_data_idx on public.calls (hotel_id) where is_test_data;
comment on column public.calls.is_test_data is 'Set only by seed_hotel_test_data(). remove_hotel_test_data() deletes exclusively rows where this is true.';

-- 2. seed function (create or replace; grants unchanged) ---------------------
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
  -- M13 reservation-origin additions
  v_guest3_id uuid;
  v_guest4_id uuid;
  v_guest5_id uuid;
  v_channel_email_id uuid;
  v_channel_sms_id uuid;
  v_channel_whatsapp_id uuid;
  v_conv_email_id uuid;
  v_conv_sms_id uuid;
  v_conv_whatsapp_id uuid;
  v_call_id uuid;
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
  -- Scoped to channel_type = 'web_chat' because this migration also seeds
  -- Email/SMS/WhatsApp test channels; an unscoped "first test channel" could
  -- otherwise pick one of those on a later run.
  select id into v_channel_id from public.channels where hotel_id = p_hotel_id and is_test_data and channel_type = 'web_chat' limit 1;
  if v_channel_id is null then
    insert into public.channels (organization_id, hotel_id, channel_type, name, is_test_data)
    values (v_org_id, p_hotel_id, 'web_chat', 'Test Data Web Chat', true)
    returning id into v_channel_id;
  end if;

  select id into v_conversation_id from public.conversations where hotel_id = p_hotel_id and is_test_data and channel_id = v_channel_id limit 1;
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

  -- M13: reservation-origin examples — messaging channels, a voice call, and
  -- five reservations around today whose source links to a conversation or
  -- call. Guarded by DEMO-0003 so it runs once per hotel (also backfilling
  -- hotels seeded before this migration) and never duplicates.
  if not exists (select 1 from public.reservations where hotel_id = p_hotel_id and confirmation_code = 'DEMO-0003') then
    -- three more guests, with phone numbers; one VIP
    insert into public.guests (organization_id, hotel_id, first_name, last_name, email, phone, vip, notes, is_test_data)
    values (v_org_id, p_hotel_id, 'Test', 'Guest Three', 'demo.guest.3@spico.test', '+385 91 555 0103', false, 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_guest3_id;
    insert into public.guests (organization_id, hotel_id, first_name, last_name, email, phone, vip, notes, is_test_data)
    values (v_org_id, p_hotel_id, 'Test', 'Guest Four', 'demo.guest.4@spico.test', '+385 91 555 0104', true, 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_guest4_id;
    insert into public.guests (organization_id, hotel_id, first_name, last_name, email, phone, vip, notes, is_test_data)
    values (v_org_id, p_hotel_id, 'Test', 'Guest Five', 'demo.guest.5@spico.test', '+385 91 555 0105', false, 'Test Data — Not a Real Guest or Reservation', true)
    returning id into v_guest5_id;

    -- one channel per messaging type (unique on hotel_id, name)
    insert into public.channels (organization_id, hotel_id, channel_type, name, is_test_data)
    values (v_org_id, p_hotel_id, 'email', 'Test Data Email', true)
    on conflict (hotel_id, name) do nothing;
    select id into v_channel_email_id from public.channels where hotel_id = p_hotel_id and name = 'Test Data Email';

    insert into public.channels (organization_id, hotel_id, channel_type, name, is_test_data)
    values (v_org_id, p_hotel_id, 'sms', 'Test Data SMS', true)
    on conflict (hotel_id, name) do nothing;
    select id into v_channel_sms_id from public.channels where hotel_id = p_hotel_id and name = 'Test Data SMS';

    insert into public.channels (organization_id, hotel_id, channel_type, name, is_test_data)
    values (v_org_id, p_hotel_id, 'whatsapp', 'Test Data WhatsApp', true)
    on conflict (hotel_id, name) do nothing;
    select id into v_channel_whatsapp_id from public.channels where hotel_id = p_hotel_id and name = 'Test Data WhatsApp';

    -- one conversation + two messages per messaging channel
    insert into public.conversations (organization_id, hotel_id, channel_id, subject, guest_display_name, guest_identifier, is_test_data)
    values (v_org_id, p_hotel_id, v_channel_email_id, 'Test Data — Email booking request', 'Test Guest Three', 'demo.guest.3@spico.test', true)
    returning id into v_conv_email_id;
    insert into public.messages (conversation_id, direction, sender_type, body, is_test_data)
    values
      (v_conv_email_id, 'inbound', 'guest', 'Test Data — Not a Real Guest or Reservation: Hi, I would like to book a standard room.', true),
      (v_conv_email_id, 'outbound', 'user', 'Test Data — Not a Real Guest or Reservation: Happy to help, your booking is confirmed.', true);

    insert into public.conversations (organization_id, hotel_id, channel_id, subject, guest_display_name, guest_identifier, is_test_data)
    values (v_org_id, p_hotel_id, v_channel_sms_id, 'Test Data — SMS booking request', 'Test Guest Five', '+385 91 555 0105', true)
    returning id into v_conv_sms_id;
    insert into public.messages (conversation_id, direction, sender_type, body, is_test_data)
    values
      (v_conv_sms_id, 'inbound', 'guest', 'Test Data — Not a Real Guest or Reservation: Any rooms free this weekend?', true),
      (v_conv_sms_id, 'outbound', 'ai', 'Test Data — Not a Real Guest or Reservation: Yes, I have booked you in.', true);

    insert into public.conversations (organization_id, hotel_id, channel_id, subject, guest_display_name, guest_identifier, is_test_data)
    values (v_org_id, p_hotel_id, v_channel_whatsapp_id, 'Test Data — WhatsApp booking request', 'Test Guest Four', '+385 91 555 0104', true)
    returning id into v_conv_whatsapp_id;
    insert into public.messages (conversation_id, direction, sender_type, body, is_test_data)
    values
      (v_conv_whatsapp_id, 'inbound', 'guest', 'Test Data — Not a Real Guest or Reservation: Can I get a room for next week?', true),
      (v_conv_whatsapp_id, 'outbound', 'user', 'Test Data — Not a Real Guest or Reservation: All set, see you then!', true);

    -- one completed inbound voice call
    insert into public.calls (
      organization_id, hotel_id, direction, from_number, to_number, status, disposition,
      started_at, answered_at, ended_at, duration_seconds, notes, is_test_data
    ) values (
      v_org_id, p_hotel_id, 'inbound', '+385 91 555 0106', null, 'completed', 'handled_by_ai',
      now() - interval '3 hours', now() - interval '3 hours' + interval '9 seconds',
      now() - interval '3 hours' + interval '3 minutes 48 seconds', 228,
      'Test Data — Not a Real Guest or Reservation', true
    )
    returning id into v_call_id;

    -- five reservations around today, each linked to its origin
    insert into public.reservations (
      organization_id, hotel_id, confirmation_code, guest_id, room_type_id, rate_plan_id,
      check_in_date, check_out_date, status, total_amount, currency, source, conversation_id, notes, is_test_data
    ) values
      (v_org_id, p_hotel_id, 'DEMO-0003', v_guest3_id, v_room_type_id, v_rate_plan_id,
       current_date + 2, current_date + 5, 'confirmed', 300, 'EUR', 'email', v_conv_email_id,
       'Test Data — Not a Real Guest or Reservation', true),
      (v_org_id, p_hotel_id, 'DEMO-0004', v_guest4_id, v_room_type_id, v_rate_plan_id,
       current_date + 1, current_date + 4, 'pending', 300, 'EUR', 'whatsapp', v_conv_whatsapp_id,
       'Test Data — Not a Real Guest or Reservation', true),
      (v_org_id, p_hotel_id, 'DEMO-0005', v_guest5_id, v_room_type_id, v_rate_plan_id,
       current_date - 5, current_date - 2, 'checked_out', 300, 'EUR', 'sms', v_conv_sms_id,
       'Test Data — Not a Real Guest or Reservation', true),
      (v_org_id, p_hotel_id, 'DEMO-0007', v_guest2_id, v_room_type_id, v_rate_plan_id,
       current_date, current_date + 3, 'confirmed', 300, 'EUR', 'web_chat', v_conversation_id,
       'Test Data — Not a Real Guest or Reservation', true);

    -- phone-origin reservation links to the call (and is in house today)
    insert into public.reservations (
      organization_id, hotel_id, confirmation_code, guest_id, room_type_id, room_id, rate_plan_id,
      check_in_date, check_out_date, status, total_amount, currency, source, call_id, notes, is_test_data
    ) values (
      v_org_id, p_hotel_id, 'DEMO-0006', v_guest1_id, v_room_type_id, v_room1_id, v_rate_plan_id,
      current_date - 1, current_date + 2, 'checked_in', 300, 'EUR', 'phone', v_call_id,
      'Test Data — Not a Real Guest or Reservation', true
    );
  end if;
end;
$$;

-- 3. remove function (create or replace; grants unchanged) -------------------
create or replace function public.remove_hotel_test_data(p_hotel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_hotel_owner_or_superadmin(p_hotel_id);

  -- Child-before-parent order, respecting ON DELETE RESTRICT constraints.
  -- reservations.conversation_id/call_id are ON DELETE SET NULL, and
  -- reservations are deleted first anyway, so calls/conversations can be
  -- removed in any order after them.
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
  delete from public.calls where hotel_id = p_hotel_id and is_test_data;
  delete from public.booking_settings where hotel_id = p_hotel_id and is_test_data;
  delete from public.ai_agents where hotel_id = p_hotel_id and is_test_data;
end;
$$;

-- Grants are unchanged from 20260803100003; re-assert them for clarity since
-- create or replace preserves them but the intent should be explicit.
revoke execute on function public.seed_hotel_test_data(uuid) from public;
revoke execute on function public.seed_hotel_test_data(uuid) from anon;
grant execute on function public.seed_hotel_test_data(uuid) to authenticated;

revoke execute on function public.remove_hotel_test_data(uuid) from public;
revoke execute on function public.remove_hotel_test_data(uuid) from anon;
grant execute on function public.remove_hotel_test_data(uuid) to authenticated;
